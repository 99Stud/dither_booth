import { describe, expect, test } from "bun:test";

import { drawTable } from "#db/internal/db.schema";
import { createTestDb } from "#db/internal/db.test-utils";

import {
  buildRarityBreakdown,
  EMPTY_LOTTERY_STATUS,
  getLotteryStatusForDb,
} from "./lottery.status";
import { insertLotteryEvent, insertPrizeWithStock } from "./lottery.test-utils";

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
  test("ignores an archived event's lottery, even if still enabled", async () => {
    const { db, sqlite } = createTestDb();

    try {
      insertLotteryEvent(
        db,
        { id: "l1", enabled: true },
        { status: "archived" },
      );
      insertPrizeWithStock(
        db,
        { id: "p", lotteryId: "l1", title: "t", winInstruction: "w" },
        3,
      );

      expect(await getLotteryStatusForDb(db)).toEqual(EMPTY_LOTTERY_STATUS);
    } finally {
      sqlite.close();
    }
  });

  test("counts what the ledger has left after wins", async () => {
    const { db, sqlite } = createTestDb();

    try {
      insertLotteryEvent(db, { id: "l1", enabled: true });
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
