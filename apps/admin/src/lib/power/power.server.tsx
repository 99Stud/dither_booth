import type { SystemctlRun } from "@dither-booth/shared/server/systemctl";

import { logKioskEvent } from "@dither-booth/logging";
import { BOOTH_SERVICE_UNIT } from "@dither-booth/shared/booth-system";
import { runSystemctl } from "@dither-booth/shared/server/systemctl";

import { ADMIN_POWER_LOG_SOURCE } from "#lib/constants";

import type { PowerAction, PowerResult } from "./power.protocol";

/*
 * `--no-block`: systemd stops this server as part of the job, so
 * `systemctl` must return, and the answer leave, before it does. The
 * booth's polkit rule (`booth service`) allows exactly these three.
 */
const POWER_COMMANDS: Record<PowerAction, string[]> = {
  "restart-apps": ["--no-block", "restart", BOOTH_SERVICE_UNIT],
  reboot: ["--no-block", "reboot"],
  "power-off": ["--no-block", "poweroff"],
};

export const getPowerCommand = (action: PowerAction) => [
  "systemctl",
  ...POWER_COMMANDS[action],
];

export async function runPowerAction(
  action: PowerAction,
  run: SystemctlRun,
  now: () => Date = () => new Date(),
): Promise<PowerResult> {
  const outcome = await runSystemctl(POWER_COMMANDS[action], run);

  if (outcome.ok) {
    logKioskEvent("info", ADMIN_POWER_LOG_SOURCE, "power-action-accepted", {
      details: { action },
    });

    return { ok: true, action, acceptedAt: now().toISOString() };
  }

  logKioskEvent("warn", ADMIN_POWER_LOG_SOURCE, "power-action-failed", {
    details: { action, exitCode: outcome.exitCode, stderr: outcome.stderr },
  });

  return { ok: false, code: outcome.code, message: outcome.message };
}
