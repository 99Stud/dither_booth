import type { PowerAction, PowerResult } from "./power.protocol";

import { POWER_ROUTE_PATH } from "./power.constants";
import { powerAvailabilitySchema, powerResultSchema } from "./power.protocol";

/**
 * False off the booth, where the admin server doesn't serve the route:
 * there its page fallback answers with the app's HTML, and a 200.
 */
export async function fetchPowerAvailable(
  signal?: AbortSignal,
): Promise<boolean> {
  const response = await fetch(POWER_ROUTE_PATH, {
    headers: { accept: "application/json" },
    signal,
  });

  if (response.status === 404) return false;

  if (!response.ok) {
    throw new Error(`The admin server answered ${response.status}.`);
  }

  return powerAvailabilitySchema.safeParse(
    await response.json().catch(() => undefined),
  ).success;
}

export async function requestPowerAction(
  action: PowerAction,
): Promise<PowerResult> {
  try {
    const response = await fetch(POWER_ROUTE_PATH, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ action }),
    });
    const parsed = powerResultSchema.safeParse(
      await response.json().catch(() => undefined),
    );

    return parsed.success
      ? parsed.data
      : {
          ok: false,
          code: "failed",
          message: `The admin server answered ${response.status}.`,
        };
  } catch {
    return {
      ok: false,
      code: "failed",
      message: "Can't reach the admin server.",
    };
  }
}

/** One probe: the admin's own health route, answered or not. */
export async function isAdminAnswering(): Promise<boolean> {
  try {
    const response = await fetch("/healthz", {
      cache: "no-store",
      signal: AbortSignal.timeout(1_500),
    });

    return response.ok;
  } catch {
    return false;
  }
}
