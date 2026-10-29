import { BOOTH_WIFI_IP, getPort, getWebPublicIp } from "@dither-booth/ports";
import { PM2_PROCESS_NAMES } from "@dither-booth/shared/booth-system";
import {
  adminHealthzPayloadSchema,
  engineHealthzPayloadSchema,
  shutterHealthzPayloadSchema,
} from "@dither-booth/shared/healthz";
import { isReleaseBundle } from "@dither-booth/shared/server/booth-update";
import { defineCommand } from "citty";
import { hostname } from "node:os";

import type { BoothContext } from "#internal/context";

import {
  POLKIT_RULE_PATH,
  buildPolkitRule,
  readAvahiHostName,
} from "#commands/network";
import {
  buildLogrotateRule,
  buildLogrotateTimerDropIn,
  buildRollbackUnit,
  buildSystemPolkitRule,
  buildUpdateUnit,
} from "#commands/service";
import { printCommandBanner } from "#internal/banner";
import {
  CAPTIVE_DNSMASQ_PATH,
  buildCaptiveDnsmasqConf,
} from "#internal/captive";
import {
  ENGINE_DATA_RELATIVE,
  ENGINE_DB_RELATIVE,
  JOURNAL_GROUP,
  LOGROTATE_MAX_SIZE_MB,
  LOGROTATE_RULE_PATH,
  LOGROTATE_TIMER_DROP_IN_PATH,
  NETWORK_SERVICE_NAME,
  SERVICE_BUN,
  SERVICE_NAME,
  SERVICE_USER,
  SSD_DATA_DIR,
  SSD_MOUNT_POINT,
  ROLLBACK_UNIT_PATH,
  SYSTEM_POLKIT_RULE_PATH,
  UPDATE_UNIT_PATH,
} from "#internal/config";
import { buildBoothContext } from "#internal/context";
import { readHubRegistration } from "#internal/hub-registration";
import {
  capture,
  detectLanIp,
  isRoot,
  serviceBun,
  serviceBunExists,
  SilentExit,
} from "#internal/system";
import { fail, heading, ok, plain, runBoothTask, warn } from "#internal/ui";

type CheckStatus = "pass" | "warn" | "fail";

export type CheckResult = {
  status: CheckStatus;
  label: string;
  detail?: string;
};

type PayloadSchema = {
  safeParse: (data: unknown) => { success: boolean };
};

function record(
  results: CheckResult[],
  status: CheckStatus,
  label: string,
  detail?: string,
): void {
  results.push({ status, label, detail });
}

async function checkSsdMounted(results: CheckResult[]): Promise<void> {
  const mount = await capture(
    ["bash", "-lc", `mount | grep " ${SSD_MOUNT_POINT} "`],
    {
      allowFailure: true,
    },
  );

  if (mount.exitCode === 0) {
    record(results, "pass", `SSD mounted at ${SSD_MOUNT_POINT}`);
  } else {
    record(results, "fail", `SSD not mounted at ${SSD_MOUNT_POINT}`);
  }
}

async function checkDataSymlink(
  results: CheckResult[],
  repoRoot: string,
): Promise<void> {
  const dataPath = `${repoRoot}/${ENGINE_DATA_RELATIVE}`;
  const target = await capture(["bash", "-lc", `readlink "${dataPath}"`], {
    allowFailure: true,
  });

  const resolved = target.stdout.trim();

  if (target.exitCode === 0 && resolved === SSD_DATA_DIR) {
    record(results, "pass", `Data symlink -> ${SSD_DATA_DIR}`);
  } else if (target.exitCode === 0) {
    record(results, "warn", `Data symlink points to ${resolved}`);
  } else {
    record(results, "fail", `${dataPath} is not a symlink to the SSD`);
  }
}

/** `booth update` unpacks with `tar --zstd`; `booth install` installs it. */
async function checkZstd(results: CheckResult[]): Promise<void> {
  const which = await capture(["which", "zstd"], { allowFailure: true });

  if (which.exitCode === 0) {
    record(results, "pass", "zstd installed (release bundles unpack)");
  } else {
    record(
      results,
      "warn",
      "zstd not installed: `booth update` can't unpack a release",
      "Run `sudo apt-get install -y zstd`.",
    );
  }
}

async function checkBun(results: CheckResult[]): Promise<void> {
  if (await serviceBunExists()) {
    const version = await capture([SERVICE_BUN, "--version"], {
      allowFailure: true,
    });
    record(results, "pass", `Bun installed (v${version.stdout.trim()})`);
  } else {
    record(results, "fail", `Bun not found at ${SERVICE_BUN}`);
  }
}

async function checkCertIp(
  results: CheckResult[],
  repoRoot: string,
): Promise<void> {
  const manifestIp = await getWebPublicIp({ repoRoot }).catch(() => undefined);
  const lanIp = await detectLanIp();

  if (!manifestIp) {
    record(results, "fail", "TLS manifest missing; run `booth cert`");
    return;
  }

  if (lanIp === BOOTH_WIFI_IP) {
    record(
      results,
      "pass",
      `On the booth Wi-Fi (${BOOTH_WIFI_IP}); certificate also covers ${manifestIp}`,
    );
    return;
  }

  if (lanIp && manifestIp !== lanIp) {
    record(
      results,
      "warn",
      `Cert IP (${manifestIp}) differs from current LAN IP (${lanIp})`,
      "Run `booth cert` to regenerate.",
    );
    return;
  }

  record(results, "pass", `Cert IP matches LAN IP (${manifestIp})`);
}

async function checkServiceEnabled(results: CheckResult[]): Promise<void> {
  const enabled = await capture(["systemctl", "is-enabled", SERVICE_NAME], {
    allowFailure: true,
  });

  if (enabled.stdout.trim() === "enabled") {
    record(results, "pass", `${SERVICE_NAME} enabled`);
  } else {
    record(results, "fail", `${SERVICE_NAME} not enabled`);
  }
}

async function checkPm2Processes(
  results: CheckResult[],
  repoRoot: string,
): Promise<void> {
  // `pm2 jlist` starts a daemon when none is running, so only ask the one
  // the service owns.
  const active = await capture(["systemctl", "is-active", SERVICE_NAME], {
    allowFailure: true,
  });

  if (active.stdout.trim() !== "active") {
    record(results, "fail", `PM2 not running (${SERVICE_NAME} inactive)`);
    return;
  }

  // PM2 is a repo dependency, and its daemon lives in the service user's
  // ~/.pm2, so ask it as that user, the way the systemd unit does.
  const list = await capture(
    serviceBun(["./node_modules/pm2/bin/pm2", "jlist"]),
    { cwd: repoRoot, allowFailure: true },
  );

  if (list.exitCode !== 0) {
    record(results, "fail", "Could not read the PM2 process list");
    return;
  }

  let processes: Array<{ name?: string; pm2_env?: { status?: string } }> = [];

  try {
    processes = JSON.parse(list.stdout);
  } catch {
    record(results, "warn", "Could not parse PM2 process list");
    return;
  }

  for (const name of Object.values(PM2_PROCESS_NAMES)) {
    const proc = processes.find((entry) => entry.name === name);

    if (proc?.pm2_env?.status === "online") {
      record(results, "pass", `PM2 ${name} online`);
    } else if (proc) {
      record(
        results,
        "fail",
        `PM2 ${name} status: ${proc.pm2_env?.status ?? "unknown"}`,
      );
    } else {
      record(results, "fail", `PM2 ${name} not found`);
    }
  }
}

async function checkHealthz(
  results: CheckResult[],
  label: string,
  url: string,
  schema: PayloadSchema,
): Promise<void> {
  const response = await capture(["curl", "-fksS", url], {
    allowFailure: true,
  });

  if (response.exitCode !== 0) {
    record(results, "fail", `${label} healthz unreachable (${url})`);
    return;
  }

  try {
    const payload = JSON.parse(response.stdout);
    const parsed = schema.safeParse(payload);

    if (parsed.success) {
      record(results, "pass", `${label} healthz ok`);
    } else {
      record(results, "warn", `${label} healthz payload invalid`);
    }
  } catch {
    record(results, "warn", `${label} healthz returned non-JSON`);
  }
}

async function checkNetworkWatch(results: CheckResult[]): Promise<void> {
  const active = await capture(
    ["systemctl", "is-active", NETWORK_SERVICE_NAME],
    { allowFailure: true },
  );

  if (active.stdout.trim() === "active") {
    record(results, "pass", `${NETWORK_SERVICE_NAME} running`);
  } else {
    record(
      results,
      "warn",
      `${NETWORK_SERVICE_NAME} not running`,
      "No booth Wi-Fi fallback. Run `sudo booth network setup`.",
    );
  }
}

async function checkSetupPage(
  results: CheckResult[],
  lanIp: string,
): Promise<void> {
  const url = `http://${lanIp}:${getPort("SETUP_PORT")}/healthz`;
  const response = await capture(["curl", "-fsS", url], {
    allowFailure: true,
  });

  if (response.exitCode === 0) {
    record(results, "pass", "setup page ok");
  } else {
    record(results, "fail", `setup page unreachable (${url})`);
  }
}

/**
 * What `booth network setup` writes, as this version of the CLI writes it.
 * An update that changed them only applies once it runs again.
 */
async function checkNetworkSetupFiles(results: CheckResult[]): Promise<void> {
  const stale: string[] = [];
  const dnsmasq = await Bun.file(CAPTIVE_DNSMASQ_PATH)
    .text()
    .catch(() => undefined);

  if (dnsmasq !== buildCaptiveDnsmasqConf()) stale.push("captive page DNS");

  // Root-only on the booth: only checked when doctor runs with sudo.
  const polkit = await Bun.file(POLKIT_RULE_PATH)
    .text()
    .catch(() => undefined);

  if (polkit !== undefined && polkit !== buildPolkitRule()) {
    stale.push("Wi-Fi permissions");
  }

  if (stale.length > 0) {
    record(
      results,
      "warn",
      `Network setup out of date (${stale.join(", ")})`,
      "Run `sudo booth network setup`.",
    );
  } else {
    record(results, "pass", "Network setup up to date");
  }
}

/** The certificate and the setup ticket only know `<hostname>.local`. */
async function checkMdnsName(results: CheckResult[]): Promise<void> {
  const machineName = hostname().split(".")[0] ?? hostname();
  const avahiName = await readAvahiHostName();

  if (!avahiName) {
    record(
      results,
      "warn",
      "avahi not answering",
      `${machineName}.local won't resolve; the IP links still work.`,
    );
  } else if (avahiName !== machineName) {
    record(
      results,
      "warn",
      `Reachable as ${avahiName}.local, not ${machineName}.local`,
      "Another device may have the name. `sudo systemctl restart avahi-daemon` retries.",
    );
  } else {
    record(results, "pass", `Reachable as ${machineName}.local`);
  }
}

/**
 * `installed` holds the logrotate rule's and the timer drop-in's content,
 * each undefined when it is missing.
 */
export function logRotationCheck(
  installed: { rule: string | undefined; timerDropIn: string | undefined },
  repoRoot: string,
): CheckResult {
  if (installed.rule === undefined) {
    return {
      status: "fail",
      label: "PM2 logs not rotated",
      detail: "They grow until the disk fills. Run `sudo booth service`.",
    };
  }

  if (installed.rule !== buildLogrotateRule(repoRoot)) {
    return {
      status: "warn",
      label: `Log rotation rule out of date (${LOGROTATE_RULE_PATH})`,
      detail: "Run `sudo booth service`.",
    };
  }

  if (installed.timerDropIn !== buildLogrotateTimerDropIn()) {
    return {
      status: "warn",
      label: `logrotate not made hourly (${LOGROTATE_TIMER_DROP_IN_PATH})`,
      detail: `A PM2 log can pass ${LOGROTATE_MAX_SIZE_MB} MB until the next day. Run \`sudo booth service\`.`,
    };
  }

  return {
    status: "pass",
    label: `PM2 logs rotated daily, or past ${LOGROTATE_MAX_SIZE_MB} MB (checked hourly)`,
  };
}

/** `groups` is `id -nG <service user>`, undefined when it failed. */
export function journalGroupCheck(groups: string | undefined): CheckResult {
  if (groups === undefined) {
    return { status: "warn", label: `Could not read ${SERVICE_USER}'s groups` };
  }

  if (groups.trim().split(/\s+/).includes(JOURNAL_GROUP)) {
    return {
      status: "pass",
      label: `${SERVICE_USER} can read the system journal`,
    };
  }

  return {
    status: "warn",
    label: `${SERVICE_USER} not in ${JOURNAL_GROUP}`,
    detail: "The Logs page shows no system lines. Run `sudo booth service`.",
  };
}

/**
 * `installed` is the rule's content, undefined when it is missing. The
 * rules folder is root-only: without sudo there is nothing to compare.
 */
export function powerControlsCheck(
  installed: string | undefined,
  asRoot: boolean,
): CheckResult | undefined {
  if (!asRoot) return undefined;

  if (installed === undefined) {
    return {
      status: "warn",
      label: "Admin can't restart, reboot or power off the booth",
      detail: "Run `sudo booth service`.",
    };
  }

  if (installed !== buildSystemPolkitRule()) {
    return {
      status: "warn",
      label: `Power permissions out of date (${SYSTEM_POLKIT_RULE_PATH})`,
      detail: "Run `sudo booth service`.",
    };
  }

  return {
    status: "pass",
    label: "Admin can restart, reboot and power off the booth",
  };
}

/**
 * `installed` holds the two units' content, each undefined when missing;
 * `runsRelease` says whether the booth runs a release bundle or a git
 * checkout from before releases.
 */
export function updatesCheck(
  installed: { update: string | undefined; rollback: string | undefined },
  runsRelease: boolean,
): CheckResult {
  if (
    installed.update !== buildUpdateUnit() ||
    installed.rollback !== buildRollbackUnit()
  ) {
    return {
      status: "warn",
      label: "Admin can't update or roll back the booth",
      detail: "Run `sudo booth service`.",
    };
  }

  if (!runsRelease) {
    return {
      status: "warn",
      label: "Runs a git checkout, not a release",
      detail:
        "`sudo booth update` installs the latest release and keeps this checkout to roll back to.",
    };
  }

  return { status: "pass", label: "Runs a release; admin can update it" };
}

async function checkUpdates(
  results: CheckResult[],
  repoRoot: string,
): Promise<void> {
  const read = (path: string) =>
    Bun.file(path)
      .text()
      .catch(() => undefined);
  results.push(
    updatesCheck(
      {
        update: await read(UPDATE_UNIT_PATH),
        rollback: await read(ROLLBACK_UNIT_PATH),
      },
      isReleaseBundle(repoRoot),
    ),
  );
}

async function checkPowerControls(results: CheckResult[]): Promise<void> {
  const installed = await Bun.file(SYSTEM_POLKIT_RULE_PATH)
    .text()
    .catch(() => undefined);
  const check = powerControlsCheck(installed, isRoot());

  if (check) results.push(check);
}

async function checkLogRotation(
  results: CheckResult[],
  repoRoot: string,
): Promise<void> {
  const read = (path: string) =>
    Bun.file(path)
      .text()
      .catch(() => undefined);

  results.push(
    logRotationCheck(
      {
        rule: await read(LOGROTATE_RULE_PATH),
        timerDropIn: await read(LOGROTATE_TIMER_DROP_IN_PATH),
      },
      repoRoot,
    ),
  );
}

async function checkJournalGroup(results: CheckResult[]): Promise<void> {
  const groups = await capture(["id", "-nG", SERVICE_USER], {
    allowFailure: true,
  });

  results.push(
    journalGroupCheck(groups.exitCode === 0 ? groups.stdout : undefined),
  );
}

function printResults(results: CheckResult[]): void {
  for (const result of results) {
    const detail = result.detail ? ` — ${result.detail}` : "";

    if (result.status === "pass") {
      ok(`${result.label}${detail}`);
    } else if (result.status === "warn") {
      warn(`${result.label}${detail}`);
    } else {
      fail(`${result.label}${detail}`);
    }
  }
}

/** Not registered is a warning: the booth runs an event without the Hub. */
function checkHubRegistration(results: CheckResult[], repoRoot: string): void {
  const check = readHubRegistration(`${repoRoot}/${ENGINE_DB_RELATIVE}`);

  if ("unreadable" in check) {
    record(results, "warn", "Hub registration unknown", check.unreadable);
  } else if (check.registered) {
    record(results, "pass", `Registered with the Hub as ${check.boothName}`);
  } else {
    record(
      results,
      "warn",
      "Not registered with the Hub",
      "no alerts reach staff; register in admin, Settings, Hub",
    );
  }
}

export async function runDoctorCommand(context: BoothContext): Promise<void> {
  const { repoRoot } = context;

  heading("Health checks");

  const results: CheckResult[] = [];

  await checkSsdMounted(results);
  await checkDataSymlink(results, repoRoot);
  await checkBun(results);
  await checkZstd(results);
  await checkCertIp(results, repoRoot);
  await checkServiceEnabled(results);
  await checkPm2Processes(results, repoRoot);
  await checkLogRotation(results, repoRoot);
  await checkJournalGroup(results);
  await checkPowerControls(results);
  await checkUpdates(results, repoRoot);

  const lanIp = (await detectLanIp()) ?? "127.0.0.1";
  await checkHealthz(
    results,
    "engine",
    "http://127.0.0.1:3001/healthz",
    engineHealthzPayloadSchema,
  );
  await checkHealthz(
    results,
    "shutter",
    `https://${lanIp}:3000/healthz`,
    shutterHealthzPayloadSchema,
  );
  await checkHealthz(
    results,
    "admin",
    `https://${lanIp}:3002/healthz`,
    adminHealthzPayloadSchema,
  );
  await checkSetupPage(results, lanIp);
  await checkNetworkWatch(results);
  await checkNetworkSetupFiles(results);
  await checkMdnsName(results);
  checkHubRegistration(results, repoRoot);

  plain("");
  printResults(results);

  const failed = results.filter((result) => result.status === "fail").length;
  const warned = results.filter((result) => result.status === "warn").length;

  plain("");

  if (failed > 0) {
    fail(`${failed} check(s) failed, ${warned} warning(s).`);
    throw new SilentExit(1);
  }

  ok(
    `All critical checks passed${warned > 0 ? `, ${warned} warning(s)` : ""}.`,
  );
}

export default defineCommand({
  meta: {
    name: "doctor",
    description: "Run health checks on the booth",
  },
  async setup() {
    printCommandBanner("doctor");
  },
  async run() {
    await runBoothTask(async () => {
      await runDoctorCommand(buildBoothContext());
    });
  },
});
