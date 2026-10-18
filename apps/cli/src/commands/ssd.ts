import { defineCommand } from "citty";

import type { BoothContext } from "#internal/context";

import { requireRoot } from "#internal/args";
import {
  ENGINE_APP_RELATIVE,
  ENGINE_DATA_RELATIVE,
  SSD_BOOTH_DIR,
  SSD_DATA_DIR,
  SSD_MOUNT_POINT,
} from "#internal/config";
import { buildBoothContext } from "#internal/context";
import { capture, chownToServiceUser, run, SilentExit } from "#internal/system";
import {
  confirm,
  fail,
  heading,
  info,
  ok,
  runBoothTask,
  step,
  warn,
} from "#internal/ui";

type BlockDevice = {
  name: string;
  type: string;
  size?: string;
  fstype?: string | null;
  mountpoint?: string | null;
  uuid?: string | null;
  rm?: boolean;
  children?: BlockDevice[];
};

function flatten(devices: BlockDevice[]): BlockDevice[] {
  return devices.flatMap((device) => [
    device,
    ...(device.children ? flatten(device.children) : []),
  ]);
}

async function listBlockDevices(): Promise<BlockDevice[]> {
  const result = await capture([
    "lsblk",
    "-J",
    "-o",
    "NAME,TYPE,SIZE,FSTYPE,MOUNTPOINT,UUID,RM",
  ]);

  const parsed = JSON.parse(result.stdout) as { blockdevices?: BlockDevice[] };

  return flatten(parsed.blockdevices ?? []);
}

// Picks an unmounted ext4 partition, preferring removable media. Refuses to
// guess when several candidates exist so the operator confirms the device.
function pickSsdPartition(
  devices: BlockDevice[],
  override?: string,
): BlockDevice | undefined {
  if (override) {
    return devices.find(
      (device) =>
        `/dev/${device.name}` === override || device.name === override,
    );
  }

  const candidates = devices.filter(
    (device) =>
      device.type === "part" &&
      device.fstype === "ext4" &&
      (!device.mountpoint || device.mountpoint === SSD_MOUNT_POINT),
  );

  const removable = candidates.filter((device) => device.rm);

  if (removable.length === 1) {
    return removable[0];
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  return undefined;
}

// booth <= 0.6.0 appended the entry with a literal "\n" and no newline, which
// mount rejects ("parse error"), so the SSD never mounted. Those lines are
// dropped and rewritten; any other entry for the mount point is kept as is.
export function withSsdFstabEntry(fstab: string, uuid: string): string {
  const lines = fstab
    .replace(/\n+$/, "")
    .split("\n")
    .filter(
      (line) =>
        !(line.includes(` ${SSD_MOUNT_POINT} `) && line.endsWith("\\n")),
    );

  const hasEntry = lines.some(
    (line) =>
      !line.trimStart().startsWith("#") &&
      (line.includes(`UUID=${uuid}`) || line.includes(` ${SSD_MOUNT_POINT} `)),
  );

  if (!hasEntry) {
    lines.push(`UUID=${uuid} ${SSD_MOUNT_POINT} ext4 defaults,nofail 0 2`);
  }

  return `${lines.join("\n")}\n`;
}

async function isRealDirectory(path: string): Promise<boolean> {
  const result = await capture(
    ["bash", "-lc", `test -d "${path}" && test ! -L "${path}"`],
    { allowFailure: true },
  );

  return result.exitCode === 0;
}

async function isSymlink(path: string): Promise<boolean> {
  const result = await capture(["bash", "-lc", `test -L "${path}"`], {
    allowFailure: true,
  });

  return result.exitCode === 0;
}

export async function runSsdCommand(context: BoothContext): Promise<void> {
  const { repoRoot, assumeYes } = context;

  heading("Mount SSD and relocate data");

  const devices = await listBlockDevices();
  const partition = pickSsdPartition(devices, process.env.BOOTH_SSD_DEVICE);

  if (!partition) {
    fail(
      "Could not determine the SSD partition automatically. List devices with `lsblk -f`, format the SSD as ext4, then set BOOTH_SSD_DEVICE=/dev/sdX1 and retry.",
    );
    throw new SilentExit(1);
  }

  const devicePath = `/dev/${partition.name}`;

  if (partition.fstype !== "ext4") {
    fail(
      `${devicePath} is not ext4 (found ${partition.fstype ?? "no filesystem"}). Format it as ext4 first; this command never formats disks.`,
    );
    throw new SilentExit(1);
  }

  if (!partition.uuid) {
    fail(`Could not read UUID for ${devicePath}.`);
    throw new SilentExit(1);
  }

  info(`Selected ${devicePath} (ext4, ${partition.size ?? "unknown size"})`);

  const proceed = await confirm(
    `Mount ${devicePath} at ${SSD_MOUNT_POINT} and relocate the database onto it?`,
    { assumeYes, defaultYes: false },
  );

  if (!proceed) {
    warn("SSD step skipped by operator.");
    return;
  }

  step(`Creating mount point ${SSD_MOUNT_POINT}`);
  await run(["mkdir", "-p", SSD_MOUNT_POINT]);

  const fstab = await Bun.file("/etc/fstab").text();
  const nextFstab = withSsdFstabEntry(fstab, partition.uuid);

  if (nextFstab === fstab) {
    info("fstab already references this SSD; leaving it unchanged.");
  } else {
    step("Writing fstab entry");
    await Bun.write("/etc/fstab", nextFstab);
  }

  step("Mounting all fstab entries (mount -a)");
  await run(["systemctl", "daemon-reload"]);
  await run(["mount", "-a"]);

  // `mount -a` skips lines it can't parse and still exits 0. Moving the data
  // now would put the database on the SD card under the mount point, hidden
  // as soon as the SSD does mount.
  const mounted = await capture(["mountpoint", "-q", SSD_MOUNT_POINT], {
    allowFailure: true,
  });

  if (mounted.exitCode !== 0) {
    fail(
      `${devicePath} did not mount at ${SSD_MOUNT_POINT}. Check /etc/fstab and \`mount -a\`, then retry.`,
    );
    throw new SilentExit(1);
  }

  step(`Ensuring data directory ${SSD_DATA_DIR}`);
  await run(["mkdir", "-p", SSD_DATA_DIR]);
  // The engine writes the database here as the service user.
  await chownToServiceUser(SSD_BOOTH_DIR);

  const dataPath = `${repoRoot}/${ENGINE_DATA_RELATIVE}`;

  if (await isSymlink(dataPath)) {
    info(`${dataPath} is already a symlink; leaving it in place.`);
    ok("SSD mounted and data directory linked");
    return;
  }

  if (await isRealDirectory(dataPath)) {
    step(`Migrating existing data from ${dataPath} to ${SSD_DATA_DIR}`);
    await run([
      "bash",
      "-lc",
      `cp -a "${dataPath}/." "${SSD_DATA_DIR}/" 2>/dev/null || true`,
    ]);
    await run(["rm", "-rf", dataPath]);
  } else {
    step(`Creating parent directory for ${dataPath}`);
    await run(["mkdir", "-p", `${repoRoot}/${ENGINE_APP_RELATIVE}`]);
  }

  step(`Linking ${dataPath} -> ${SSD_DATA_DIR}`);
  await run(["ln", "-s", SSD_DATA_DIR, dataPath]);

  ok("SSD mounted and database relocated");
}

export default defineCommand({
  meta: {
    name: "ssd",
    description: "Mount the SSD and relocate the database onto it",
  },
  async setup() {
    requireRoot("ssd");
  },
  async run() {
    await runBoothTask(async () => {
      await runSsdCommand(buildBoothContext());
    });
  },
});
