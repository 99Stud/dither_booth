import { defineCommand } from "citty";

import type { BoothContext } from "#internal/context";

import { requireRoot } from "#internal/args";
import {
  API_DATA_RELATIVE,
  SSD_DATA_DIR,
  SSD_MOUNT_POINT,
} from "#internal/config";
import { buildBoothContext } from "#internal/context";
import { capture, run, SilentExit } from "#internal/system";
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

async function fstabHasEntry(uuid: string): Promise<boolean> {
  const fstab = await Bun.file("/etc/fstab")
    .text()
    .catch(() => "");

  return fstab.includes(`UUID=${uuid}`) || fstab.includes(SSD_MOUNT_POINT);
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

  if (await fstabHasEntry(partition.uuid)) {
    info("fstab already references this SSD; leaving it unchanged.");
  } else {
    step("Adding fstab entry");
    const line = `UUID=${partition.uuid} ${SSD_MOUNT_POINT} ext4 defaults,nofail 0 2\n`;
    await run([
      "bash",
      "-lc",
      `printf '%s' ${JSON.stringify(line)} >> /etc/fstab`,
    ]);
  }

  step("Mounting all fstab entries (mount -a)");
  await run(["mount", "-a"]);

  step(`Ensuring data directory ${SSD_DATA_DIR}`);
  await run(["mkdir", "-p", SSD_DATA_DIR]);

  const dataPath = `${repoRoot}/${API_DATA_RELATIVE}`;

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
    await run(["mkdir", "-p", `${repoRoot}/apps/api`]);
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
