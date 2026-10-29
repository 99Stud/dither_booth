import { PM2_PROCESS_NAMES } from "@dither-booth/shared/booth-system";

/*
 * Whether a release came up: every PM2 process online long enough that
 * PM2 isn't restarting it in a loop, and the engine's healthz answering.
 */

/** PM2's `min_uptime` is 10 s: past it, a process counts as started. */
export const HEALTHY_UPTIME_MS = 15_000;

type Pm2Entry = {
  name?: string;
  pm2_env?: { status?: string; pm_uptime?: number };
};

export type HealthReading = {
  /** `pm2 jlist`, or undefined when it couldn't be read. */
  pm2: string | undefined;
  engineHealthy: boolean;
  now: number;
};

export type HealthVerdict = { ok: true } | { ok: false; reason: string };

export function assessBoothHealth(reading: HealthReading): HealthVerdict {
  if (reading.pm2 === undefined) {
    return { ok: false, reason: "PM2 isn't answering" };
  }

  let entries: Pm2Entry[];

  try {
    entries = JSON.parse(reading.pm2);
  } catch {
    return { ok: false, reason: "PM2's process list isn't JSON" };
  }

  for (const name of Object.values(PM2_PROCESS_NAMES)) {
    const entry = entries.find((candidate) => candidate.name === name);
    const status = entry?.pm2_env?.status;

    if (status !== "online") {
      return { ok: false, reason: `${name} is ${status ?? "missing"}` };
    }

    const startedAt = entry?.pm2_env?.pm_uptime ?? reading.now;

    if (reading.now - startedAt < HEALTHY_UPTIME_MS) {
      return { ok: false, reason: `${name} only just started` };
    }
  }

  if (!reading.engineHealthy) {
    return { ok: false, reason: "the engine's healthz doesn't answer ok" };
  }

  return { ok: true };
}
