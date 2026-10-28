import { useQuery } from "@tanstack/react-query";

import type { SystemSnapshot } from "./system.protocol";

import {
  SYSTEM_ROUTE_PATH,
  SYSTEM_SAMPLE_INTERVAL_MS,
} from "./system.constants";
import { systemSnapshotSchema } from "./system.protocol";

export const SYSTEM_QUERY_KEY = ["system"] as const;

export async function fetchSystemSnapshot(
  signal?: AbortSignal,
): Promise<SystemSnapshot> {
  const response = await fetch(SYSTEM_ROUTE_PATH, {
    headers: { accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`The admin server answered ${response.status}.`);
  }

  return systemSnapshotSchema.parse(await response.json());
}

/**
 * The Pi's latest reading and its last hour, refreshed as often as the
 * admin server reads it. Shared by the System page and the Health card:
 * one request serves both. On a failure the last reading stays.
 */
export const useSystemMetrics = () =>
  useQuery({
    queryKey: SYSTEM_QUERY_KEY,
    queryFn: ({ signal }) => fetchSystemSnapshot(signal),
    refetchInterval: SYSTEM_SAMPLE_INTERVAL_MS,
    refetchIntervalInBackground: true,
    refetchOnReconnect: true,
  });
