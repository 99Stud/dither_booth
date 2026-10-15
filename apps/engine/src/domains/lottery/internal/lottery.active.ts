import { eq } from "drizzle-orm";

import type { DbExecutor } from "#db/internal/db.types";

import { campaignTable, lotteryTable } from "#db/internal/db.schema";

export type ActiveEventLottery = {
  campaignId: string;
  /** The event's lottery, enabled or not; null when it has none. */
  lottery: typeof lotteryTable.$inferSelect | null;
};

/**
 * The active event and its lottery. Archived events keep their lottery rows,
 * possibly still flagged `enabled`, so lottery code finds the lottery to draw
 * against here and never by `enabled` alone.
 */
export function getActiveEventLottery(
  executor: DbExecutor,
): ActiveEventLottery | null {
  const row = executor
    .select({ campaignId: campaignTable.id, lottery: lotteryTable })
    .from(campaignTable)
    .leftJoin(lotteryTable, eq(lotteryTable.id, campaignTable.lotteryId))
    .where(eq(campaignTable.status, "active"))
    .get();

  return row ? { campaignId: row.campaignId, lottery: row.lottery } : null;
}
