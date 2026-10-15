import { TRPCError } from "@trpc/server";
import { type Column, eq, getTableName, sql } from "drizzle-orm";

import type { DbExecutor, DbTransaction } from "#db/internal/db.types";

import {
  drawTable,
  prizeTable,
  STOCK_ADJUSTMENT_REASONS,
  stockAdjustmentTable,
} from "#db/internal/db.schema";

export type StockAdjustmentReason = (typeof STOCK_ADJUSTMENT_REASONS)[number];

/**
 * `"table"."column"`, always qualified. Drizzle drops the table name from
 * columns at the top of a single-table select, which inside a correlated
 * subquery would bind `prize_id = id` to the subquery's own table.
 */
const qualified = (column: Column) =>
  sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`;

// A prize's stock is never stored: it is the sum of its ledger entries minus
// its winning draws. Both expressions are correlated subqueries on the outer
// `prize` row, so they slot into any select over `prizeTable`.
const allocatedStock = sql<number>`coalesce((
  select sum(${qualified(stockAdjustmentTable.delta)})
  from ${stockAdjustmentTable}
  where ${qualified(stockAdjustmentTable.prizeId)} = ${qualified(prizeTable.id)}
), 0)`;

const wonStock = sql<number>`(
  select count(*)
  from ${drawTable}
  where ${qualified(drawTable.prizeId)} = ${qualified(prizeTable.id)}
)`;

const remainingStock = sql<number>`(${allocatedStock} - ${wonStock})`;

/**
 * `totalQuantity` is the stock ever allocated to the prize (net of
 * corrections), `remainingQuantity` what is left to win.
 */
export const prizeStockColumns = {
  totalQuantity: allocatedStock.mapWith(Number),
  remainingQuantity: remainingStock.mapWith(Number),
};

/** For a `where`: only prizes that can still be won. */
export const hasRemainingStock = sql`${remainingStock} > 0`;

export function getPrizeStock(
  executor: DbExecutor,
  prizeId: string,
): { totalQuantity: number; remainingQuantity: number } | undefined {
  return executor
    .select(prizeStockColumns)
    .from(prizeTable)
    .where(eq(prizeTable.id, prizeId))
    .get();
}

/**
 * Records one stock change. The id comes from whoever asked for the change,
 * so a retried request is applied once: a repeat with the same id is a
 * no-op, and an id reused for a different change is a CONFLICT.
 */
export function applyStockAdjustment(
  tx: DbTransaction,
  adjustment: {
    id: string;
    prizeId: string;
    delta: number;
    reason: StockAdjustmentReason;
  },
): "applied" | "duplicate" {
  const existing = tx
    .select()
    .from(stockAdjustmentTable)
    .where(eq(stockAdjustmentTable.id, adjustment.id))
    .get();

  if (existing) {
    if (
      existing.prizeId !== adjustment.prizeId ||
      existing.delta !== adjustment.delta
    ) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This stock change id was already used for another change.",
      });
    }
    return "duplicate";
  }

  const stock = getPrizeStock(tx, adjustment.prizeId);
  if (!stock) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Prize not found." });
  }

  if (stock.remainingQuantity + adjustment.delta < 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Only ${stock.remainingQuantity} left, so at most ${stock.remainingQuantity} can be removed.`,
    });
  }

  tx.insert(stockAdjustmentTable)
    .values(adjustment)
    .onConflictDoNothing({ target: stockAdjustmentTable.id })
    .run();

  return "applied";
}
