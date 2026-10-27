import { useQuery } from "@tanstack/react-query";

import { getBoothProblems } from "#lib/healthz/healthz.utils";
import { useTRPC } from "#lib/trpc/trpc.client";

import type { CurrentEvent } from "../Event.types";

import { summarizeOverview } from "../overview.utils";
import { useGuestsPerHour } from "./useGuestsPerHour";

/** How often the visit stats refresh, so the Overview follows the night live. */
const VISIT_STATS_POLL_MS = 10_000;

/** The booth's health changes less often, and the check waits on the Shutter. */
const HEALTHZ_POLL_MS = 30_000;

/**
 * The Overview's facts: the visit stats, the booth's health and the staff's
 * guests-per-hour estimate, summarized. Null until the stats arrive.
 */
export const useOverviewSummary = (event: CurrentEvent) => {
  const trpc = useTRPC();
  const [estimatedGuestsPerHour] = useGuestsPerHour();
  const { data: stats } = useQuery({
    ...trpc.config.getVisitStats.queryOptions(),
    refetchInterval: VISIT_STATS_POLL_MS,
  });
  const { data: healthz } = useQuery(
    trpc.ops.getHealthz.queryOptions(undefined, {
      refetchInterval: HEALTHZ_POLL_MS,
      // Alone: it waits on the Shutter, which may be the thing that's down.
      trpc: { context: { skipBatch: true } },
    }),
  );

  if (!stats) return null;

  return {
    stats,
    isHealthKnown: healthz !== undefined,
    summary: summarizeOverview({
      stats,
      event,
      boothProblems: healthz ? getBoothProblems(healthz) : null,
      estimatedGuestsPerHour,
      now: new Date(),
    }),
  };
};
