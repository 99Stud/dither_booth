import { afterEach, describe, expect, test } from "bun:test";

import type { DB } from "#db/internal/db.types";

import {
  drawTable,
  lotteryTable,
  stockAdjustmentTable,
} from "#db/internal/db.schema";
import { createTestDb } from "#db/internal/db.test-utils";

import { applyStockAdjustment, getPrizeStock } from "./lottery.stock";
import { insertPrizeWithStock } from "./lottery.test-utils";

const openDbs: Array<{ close: () => void }> = [];

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close();
});

function setup(stock: number) {
  const { db, sqlite } = createTestDb();
  openDbs.push(sqlite);

  db.insert(lotteryTable).values({ id: "l1" }).run();
  insertPrizeWithStock(
    db,
    { id: "p1", lotteryId: "l1", title: "Tote bag", winInstruction: "Bar" },
    stock,
  );

  return { db, sqlite };
}

const win = (db: DB, ref: string) =>
  db
    .insert(drawTable)
    .values({ lotteryId: "l1", prizeId: "p1", ticketRef: ref })
    .run();

const adjust = (db: DB, id: string, delta: number) =>
  db.transaction((tx) =>
    applyStockAdjustment(tx, {
      id,
      prizeId: "p1",
      delta,
      reason: delta > 0 ? "restock" : "correction",
    }),
  );

describe("prize stock", () => {
  test("is the sum of adjustments minus wins", () => {
    const { db } = setup(5);
    win(db, "000001");
    win(db, "000002");
    adjust(db, "a-plus", 3);

    expect(getPrizeStock(db, "p1")).toEqual({
      totalQuantity: 8,
      remainingQuantity: 6,
    });
  });

  test("is zero for a prize with no ledger entries", () => {
    const { db } = setup(0);

    expect(getPrizeStock(db, "p1")).toEqual({
      totalQuantity: 0,
      remainingQuantity: 0,
    });
    expect(getPrizeStock(db, "missing")).toBeUndefined();
  });
});

describe("applyStockAdjustment", () => {
  test("applies a retried adjustment once", () => {
    const { db } = setup(2);

    expect(adjust(db, "a1", 4)).toBe("applied");
    expect(adjust(db, "a1", 4)).toBe("duplicate");

    expect(getPrizeStock(db, "p1")?.remainingQuantity).toBe(6);
  });

  test("a retried removal that emptied the stock is still a no-op", () => {
    const { db } = setup(2);

    expect(adjust(db, "take-all", -2)).toBe("applied");
    // The database trigger would reject a second -2, so the retry must be
    // recognised as a duplicate before it reaches the insert.
    expect(adjust(db, "take-all", -2)).toBe("duplicate");
    expect(getPrizeStock(db, "p1")?.remainingQuantity).toBe(0);
  });

  test("rejects an id reused for a different change", () => {
    const { db } = setup(2);
    adjust(db, "a1", 4);

    expect(() => adjust(db, "a1", 5)).toThrow(
      expect.objectContaining({ code: "CONFLICT" }),
    );
  });

  test("never takes stock below zero", () => {
    const { db } = setup(3);
    win(db, "000001");

    expect(() => adjust(db, "too-many", -3)).toThrow(
      expect.objectContaining({ code: "BAD_REQUEST" }),
    );
    expect(adjust(db, "exact", -2)).toBe("applied");
    expect(getPrizeStock(db, "p1")?.remainingQuantity).toBe(0);
  });

  test("rejects an unknown prize", () => {
    const { db } = setup(1);

    expect(() =>
      db.transaction((tx) =>
        applyStockAdjustment(tx, {
          id: "a1",
          prizeId: "missing",
          delta: 1,
          reason: "restock",
        }),
      ),
    ).toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
  });
});

describe("database triggers", () => {
  test("reject a raw adjustment that would make stock negative", () => {
    const { db } = setup(1);

    expect(() =>
      db
        .insert(stockAdjustmentTable)
        .values({ id: "raw", prizeId: "p1", delta: -2, reason: "correction" })
        .run(),
    ).toThrow(/negative/);
  });

  test("reject a win on a prize with no stock left", () => {
    const { db } = setup(1);
    win(db, "000001");

    expect(() => win(db, "000002")).toThrow(/out of stock/);
    expect(db.select().from(drawTable).all()).toHaveLength(1);
  });

  test("let losses through without touching stock", () => {
    const { db } = setup(0);

    db.insert(drawTable)
      .values({ lotteryId: "l1", prizeId: null, ticketRef: "000001" })
      .run();

    expect(db.select().from(drawTable).all()).toHaveLength(1);
  });
});
