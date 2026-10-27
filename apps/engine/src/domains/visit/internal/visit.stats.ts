import { and, eq, gte, sql } from "drizzle-orm";

import type { DbExecutor } from "#db/internal/db.types";

import { campaignTable, drawTable, visitTable } from "#db/internal/db.schema";

/** How many hours `hourly` covers, the current one included: a night. */
export const VISIT_STATS_HOURS = 12;

const HOUR_S = 3600;

export type VisitStats = {
  /** Every visit, however it ended. */
  visits: number;
  /** Visits that got their receipt. */
  completed: number;
  /** Visits whose printing failed. */
  failed: number;
  /** Visits that won a prize. */
  wins: number;
  /** Mean length of a completed visit, Start to the end; null until one has one. */
  avgDurationS: number | null;
  /** When the last visit started, as ISO; null before the first. */
  lastVisitAt: string | null;
  /**
   * Visits started in each of the last `VISIT_STATS_HOURS` hours, oldest
   * first, the current hour last. `hour` is the hour's start, as ISO.
   */
  hourly: Array<{ hour: string; visits: number }>;
};

const count = (condition: ReturnType<typeof sql>) =>
  sql<number>`coalesce(sum(case when ${condition} then 1 else 0 end), 0)`.mapWith(
    Number,
  );

/** The active event's visit counts, or null when no event is active. */
export function getVisitStatsForDb(
  executor: DbExecutor,
  now: Date = new Date(),
): VisitStats | null {
  const campaign = executor
    .select({ id: campaignTable.id })
    .from(campaignTable)
    .where(eq(campaignTable.status, "active"))
    .get();
  if (!campaign) return null;

  const ofEvent = eq(visitTable.campaignId, campaign.id);
  const durationS = sql`${visitTable.endedAt} - ${visitTable.startedAt}`;
  const totals = executor
    .select({
      visits: sql<number>`count(*)`.mapWith(Number),
      completed: count(sql`${visitTable.endReason} = 'completed'`),
      failed: count(sql`${visitTable.endReason} = 'failed'`),
      wins: count(sql`${drawTable.prizeId} is not null`),
      // A backfilled visit knows only its draw's time, so it has no length.
      avgDurationS: sql<number | null>`avg(case
        when ${visitTable.endReason} = 'completed' and ${durationS} > 0
        then ${durationS} end)`,
      lastStartedAt: sql<number | null>`max(${visitTable.startedAt})`,
    })
    .from(visitTable)
    .leftJoin(drawTable, eq(drawTable.id, visitTable.drawId))
    .where(ofEvent)
    .get();

  // Hours are counted in epoch seconds, so they start on the hour wherever
  // the booth's time zone is a whole number of hours from UTC.
  const currentHourS = Math.floor(now.getTime() / 1000 / HOUR_S) * HOUR_S;
  const firstHourS = currentHourS - (VISIT_STATS_HOURS - 1) * HOUR_S;
  const hourS = sql<number>`${visitTable.startedAt} - ${visitTable.startedAt} % ${HOUR_S}`;
  const perHour = new Map(
    executor
      .select({
        hourS: hourS.mapWith(Number),
        visits: sql<number>`count(*)`.mapWith(Number),
      })
      .from(visitTable)
      .where(
        and(ofEvent, gte(visitTable.startedAt, new Date(firstHourS * 1000))),
      )
      .groupBy(hourS)
      .all()
      .map((row) => [row.hourS, row.visits]),
  );

  const { avgDurationS, lastStartedAt, ...counts } = totals ?? {
    visits: 0,
    completed: 0,
    failed: 0,
    wins: 0,
    avgDurationS: null,
    lastStartedAt: null,
  };

  return {
    ...counts,
    avgDurationS: avgDurationS === null ? null : Math.round(avgDurationS),
    lastVisitAt:
      lastStartedAt === null
        ? null
        : new Date(lastStartedAt * 1000).toISOString(),
    hourly: Array.from({ length: VISIT_STATS_HOURS }, (_, index) => {
      const startS = firstHourS + index * HOUR_S;
      return {
        hour: new Date(startS * 1000).toISOString(),
        visits: perHour.get(startS) ?? 0,
      };
    }),
  };
}
