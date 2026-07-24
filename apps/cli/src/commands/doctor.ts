import { getWebPublicIp } from "@dither-booth/ports";
import {
  adminHealthzPayloadSchema,
  apiHealthzPayloadSchema,
  webHealthzPayloadSchema,
} from "@dither-booth/shared/healthz";
import { defineCommand } from "citty";

import type { BoothContext } from "#internal/context";

import { printCommandBanner } from "#internal/banner";
import {
  API_DATA_RELATIVE,
  PM2_PROCESS_NAMES,
  SERVICE_NAME,
  SSD_DATA_DIR,
  SSD_MOUNT_POINT,
} from "#internal/config";
import { buildBoothContext } from "#internal/context";
import {
  capture,
  commandExists,
  detectLanIp,
  SilentExit,
} from "#internal/system";
import { fail, heading, ok, plain, runBoothTask, warn } from "#internal/ui";

type CheckStatus = "pass" | "warn" | "fail";

type CheckResult = {
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
  const dataPath = `${repoRoot}/${API_DATA_RELATIVE}`;
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

async function checkBun(results: CheckResult[]): Promise<void> {
  if (await commandExists("bun")) {
    const version = await capture(["bun", "--version"], { allowFailure: true });
    record(results, "pass", `Bun installed (v${version.stdout.trim()})`);
  } else {
    record(results, "fail", "Bun not found on PATH");
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

async function checkPm2Processes(results: CheckResult[]): Promise<void> {
  const list = await capture(["bash", "-lc", "pm2 jlist"], {
    allowFailure: true,
  });

  if (list.exitCode !== 0) {
    record(results, "fail", "PM2 not running or not installed");
    return;
  }

  let processes: Array<{ name?: string; pm2_env?: { status?: string } }> = [];

  try {
    processes = JSON.parse(list.stdout);
  } catch {
    record(results, "warn", "Could not parse PM2 process list");
    return;
  }

  for (const name of PM2_PROCESS_NAMES) {
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

export async function runDoctorCommand(context: BoothContext): Promise<void> {
  const { repoRoot } = context;

  heading("Health checks");

  const results: CheckResult[] = [];

  await checkSsdMounted(results);
  await checkDataSymlink(results, repoRoot);
  await checkBun(results);
  await checkCertIp(results, repoRoot);
  await checkServiceEnabled(results);
  await checkPm2Processes(results);

  const lanIp = (await detectLanIp()) ?? "127.0.0.1";
  await checkHealthz(
    results,
    "api",
    "http://127.0.0.1:3001/healthz",
    apiHealthzPayloadSchema,
  );
  await checkHealthz(
    results,
    "web",
    `https://${lanIp}:3000/healthz`,
    webHealthzPayloadSchema,
  );
  await checkHealthz(
    results,
    "admin",
    `https://${lanIp}:3002/healthz`,
    adminHealthzPayloadSchema,
  );

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
