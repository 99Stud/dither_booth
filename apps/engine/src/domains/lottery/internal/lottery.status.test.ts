import { describe, expect, test } from "bun:test";

import { drawTable, lotteryTable } from "#db/internal/db.schema";
import { createTestDb } from "#db/internal/db.test-utils";

import { buildRarityBreakdown, getLotteryStatusForDb } from "./lottery.status";
import { insertPrizeWithStock } from "./lottery.test-utils";

describe("buildRarityBreakdown", () => {
  test("aggregates remaining by rarity and skips zeros", () => {
    expect(
      buildRarityBreakdown([
        { rarity: "common", remainingQuantity: 2 },
        { rarity: "common", remainingQuantity: 1 },
        { rarity: "legendary", remainingQuantity: 1 },
        { rarity: "rare", remainingQuantity: 0 },
      ]),
    ).toEqual([
      { rarity: "common", remaining: 3 },
      { rarity: "legendary", remaining: 1 },
    ]);
  });

  test("returns empty when nothing remains", () => {
    expect(
      buildRarityBreakdown([{ rarity: "epic", remainingQuantity: 0 }]),
    ).toEqual([]);
  });
});

describe("getLotteryStatusForDb", () => {
  test("counts what the ledger has left after wins", async () => {
    const { db, sqlite } = createTestDb();

    try {
      db.insert(lotteryTable).values({ id: "l1", enabled: true }).run();
      const prize = { lotteryId: "l1", title: "t", winInstruction: "w" };
      insertPrizeWithStock(db, { ...prize, id: "c", rarity: "common" }, 3);
      insertPrizeWithStock(db, { ...prize, id: "r", rarity: "rare" }, 1);
      insertPrizeWithStock(
        db,
        { ...prize, id: "gone", rarity: "epic", removed: true },
        9,
      );
      db.insert(drawTable)
        .values([
          { lotteryId: "l1", prizeId: "c", ticketRef: "000001" },
          { lotteryId: "l1", prizeId: "r", ticketRef: "000002" },
          { lotteryId: "l1", prizeId: null, ticketRef: "000003" },
        ])
        .run();

      const status = await getLotteryStatusForDb(db);

      expect(status.remainingPrizes).toBe(2);
      expect(status.rarityBreakdown).toEqual([
        { rarity: "common", remaining: 2 },
      ]);
      expect(status.totalDraws).toBe(3);
    } finally {
      sqlite.close();
    }
  });
});
