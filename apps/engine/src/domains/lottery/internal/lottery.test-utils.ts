import type { DB } from "#db/internal/db.types";

import {
  campaignTable,
  lotteryTable,
  prizeTable,
  stockAdjustmentTable,
} from "#db/internal/db.schema";

import { getPrizeStock } from "./lottery.stock";

type PrizeInsert = typeof prizeTable.$inferInsert;
type LotteryInsert = typeof lotteryTable.$inferInsert;
type CampaignInsert = typeof campaignTable.$inferInsert;

/**
 * Inserts a lottery and the event (campaign) that owns it, active unless
 * `campaign.status` says otherwise. Draws only ever use the active event's
 * lottery, so a bare lottery row is never drawn against.
 */
export function insertLotteryEvent(
  db: DB,
  lottery: LotteryInsert & { id: string },
  campaign: Partial<CampaignInsert> = {},
): { campaignId: string } {
  const campaignId = campaign.id ?? `campaign-${lottery.id}`;

  db.insert(lotteryTable).values(lottery).run();
  db.insert(campaignTable)
    .values({
      name: `Event ${lottery.id}`,
      ...campaign,
      id: campaignId,
      lotteryId: lottery.id,
    })
    .run();

  return { campaignId };
}

/**
 * Inserts a prize and records `stock` as its initial ledger entry, the way
 * `createPrize` does. Stock 0 writes no entry.
 */
export function insertPrizeWithStock(
  db: DB,
  prize: PrizeInsert & { id: string },
  stock: number,
): void {
  db.insert(prizeTable).values(prize).run();

  if (stock !== 0) {
    db.insert(stockAdjustmentTable)
      .values({
        id: `test-initial-${prize.id}`,
        prizeId: prize.id,
        delta: stock,
        reason: "initial",
      })
      .run();
  }
}

/** Derived stock of one prize, or undefined when it does not exist. */
export const stockOf = (db: DB, prizeId: string) => getPrizeStock(db, prizeId);
