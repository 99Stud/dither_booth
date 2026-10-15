import type { DB } from "#db/internal/db.types";

import { prizeTable, stockAdjustmentTable } from "#db/internal/db.schema";

import { getPrizeStock } from "./lottery.stock";

type PrizeInsert = typeof prizeTable.$inferInsert;

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
