import { eq, sql } from "drizzle-orm";

import type { DbExecutor } from "#db/internal/db.types";

import { campaignTable, drawTable, visitTable } from "#db/internal/db.schema";

export type VisitStats = {
  /** Every visit, however it ended. */
  visits: number;
  /** Visits that got their receipt. */
  completed: number;
  /** Visits whose tickets printed in full. */
  prints: number;
  /** Visits that won a prize. */
  wins: number;
  /** Mean length of a completed visit, Start to the end; null until one has one. */
  avgDurationS: number | null;
};

const count = (condition: ReturnType<typeof sql>) =>
  sql<number>`coalesce(sum(case when ${condition} then 1 else 0 end), 0)`.mapWith(
    Number,
  );

/** The active event's visit counts, or null when no event is active. */
export function getVisitStatsForDb(executor: DbExecutor): VisitStats | null {
  const campaign = executor
    .select({ id: campaignTable.id })
    .from(campaignTable)
    .where(eq(campaignTable.status, "active"))
    .get();
  if (!campaign) return null;

  const durationS = sql`${visitTable.endedAt} - ${visitTable.startedAt}`;
  const row = executor
    .select({
      visits: sql<number>`count(*)`.mapWith(Number),
      completed: count(sql`${visitTable.endReason} = 'completed'`),
      prints: count(sql`${visitTable.printedAt} is not null`),
      wins: count(sql`${drawTable.prizeId} is not null`),
      // A backfilled visit knows only its draw's time, so it has no length.
      avgDurationS: sql<number | null>`avg(case
        when ${visitTable.endReason} = 'completed' and ${durationS} > 0
        then ${durationS} end)`,
    })
    .from(visitTable)
    .leftJoin(drawTable, eq(drawTable.id, visitTable.drawId))
    .where(eq(visitTable.campaignId, campaign.id))
    .get();

  // An aggregate without `group by` always returns its one row.
  const { avgDurationS, ...counts } = row!;

  return {
    ...counts,
    avgDurationS: avgDurationS === null ? null : Math.round(avgDurationS),
  };
}
