import { fetchAdminJson, postAdminJson } from "#lib/admin-api/admin-api.client";

import type { PowerAction, PowerResult } from "./power.protocol";

import { POWER_ROUTE_PATH } from "./power.constants";
import { powerAvailabilitySchema, powerResultSchema } from "./power.protocol";

/** False off the booth, where the admin server doesn't serve the route. */
export async function fetchPowerAvailable(
  signal?: AbortSignal,
): Promise<boolean> {
  return (
    (await fetchAdminJson(
      POWER_ROUTE_PATH,
      powerAvailabilitySchema,
      signal,
    )) !== null
  );
}

export const requestPowerAction = (action: PowerAction): Promise<PowerResult> =>
  postAdminJson(POWER_ROUTE_PATH, { action }, powerResultSchema, (message) => ({
    ok: false as const,
    code: "failed" as const,
    message,
  }));

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
