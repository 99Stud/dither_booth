import { logKioskEvent } from "@dither-booth/logging";
import { BOOTH_SERVICE_UNIT } from "@dither-booth/shared/booth-system";

import { ADMIN_POWER_LOG_SOURCE } from "#lib/constants";

import type { PowerAction, PowerResult } from "./power.protocol";

export type PowerRun = (
  args: string[],
) => Promise<{ exitCode: number; stderr: string }>;

/*
 * `--no-block`: systemd stops this server as part of the job, so
 * `systemctl` must return, and the answer leave, before it does. The
 * booth's polkit rule (`booth service`) allows exactly these three.
 */
const POWER_COMMANDS: Record<PowerAction, string[]> = {
  "restart-apps": ["systemctl", "--no-block", "restart", BOOTH_SERVICE_UNIT],
  reboot: ["systemctl", "--no-block", "reboot"],
  "power-off": ["systemctl", "--no-block", "poweroff"],
};

export const getPowerCommand = (action: PowerAction) => POWER_COMMANDS[action];

// What systemctl prints when polkit says no.
const NOT_PERMITTED = /access denied|interactive authentication required/iu;

export async function runPowerAction(
  action: PowerAction,
  run: PowerRun,
  now: () => Date = () => new Date(),
): Promise<PowerResult> {
  let outcome: Awaited<ReturnType<PowerRun>>;

  try {
    outcome = await run(getPowerCommand(action));
  } catch (error) {
    outcome = {
      exitCode: -1,
      stderr: error instanceof Error ? error.message : String(error),
    };
  }

  if (outcome.exitCode === 0) {
    logKioskEvent("info", ADMIN_POWER_LOG_SOURCE, "power-action-accepted", {
      details: { action },
    });

    return { ok: true, action, acceptedAt: now().toISOString() };
  }

  const stderr = outcome.stderr.trim();
  const result: PowerResult = NOT_PERMITTED.test(stderr)
    ? {
        ok: false,
        code: "not-permitted",
        message:
          "The booth doesn't allow this yet. Run `sudo booth service` on the booth.",
      }
    : {
        ok: false,
        code: "failed",
        message: stderr || `systemctl exited with ${outcome.exitCode}.`,
      };

  logKioskEvent("warn", ADMIN_POWER_LOG_SOURCE, "power-action-failed", {
    details: { action, exitCode: outcome.exitCode, stderr },
  });

  return result;
}

/** Runs the command on the machine the admin server runs on. */
export const hostPowerRun: PowerRun = async (args) => {
  // `Bun.spawn` throws when the binary is missing: `runPowerAction` reports it.
  const proc = Bun.spawn(args, {
    stderr: "pipe",
    stdin: "ignore",
    stdout: "ignore",
  });
  const [stderr, exitCode] = await Promise.all([
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exitCode, stderr };
};
