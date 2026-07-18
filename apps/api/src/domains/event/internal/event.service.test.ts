import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { resolve } from "node:path";

import {
  campaignTable,
  drawTable,
  lotteryTable,
  prizeTable,
  printConfigTable,
} from "#db/internal/db.schema";

import {
  createEventForDb,
  createLotForDb,
  deleteLotForDb,
  getCurrentEventForDb,
  replaceEventForDb,
  restockLotForDb,
  updateLotterySettingsForDb,
} from "./event.service";

function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle({
    client: sqlite,
    schema: {
      printConfigTable,
      campaignTable,
      lotteryTable,
      prizeTable,
      drawTable,
    },
  });

  migrate(db, {
    migrationsFolder: resolve(import.meta.dir, "../../../../drizzle"),
  });

  return { db, sqlite };
}

describe("event.service", () => {
  test("createEvent enforces singleton campaign", async () => {
    const { db, sqlite } = createTestDb();

    try {
      const created = await createEventForDb(db, {
        name: "Launch night",
        noWinWeight: 50,
        winCooldownMinutes: 5,
        printLoserTicket: false,
        enabled: false,
      });

      expect(created.campaign.name).toBe("Launch night");
      expect(created.lottery.enabled).toBe(false);
      expect(created.lottery.printLoserTicket).toBe(false);
      expect(created.lots).toEqual([]);

      await expect(
        createEventForDb(db, {
          name: "Second event",
          noWinWeight: 1,
          winCooldownMinutes: 0,
        printLoserTicket: false,
        enabled: true,
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    } finally {
      sqlite.close();
    }
  });

  test("replaceEvent wipes previous lottery data and creates a new event", async () => {
    const { db, sqlite } = createTestDb();

    try {
      const first = await createEventForDb(db, {
        name: "Old event",
        noWinWeight: 10,
        winCooldownMinutes: 5,
        printLoserTicket: false,
        enabled: true,
      });

      const withLot = await createLotForDb(db, {
        winDescription: "sticker",
        weight: 1,
        totalQuantity: 5,
        remainingQuantity: 5,
        rarity: "common",
      });

      await db.insert(drawTable).values({
        lotteryId: first.lottery.id,
        prizeId: withLot.lots[0]!.id,
      });

      const replaced = await replaceEventForDb(db, {
        name: "New event",
        noWinWeight: 20,
        winCooldownMinutes: 0,
        printLoserTicket: false,
        enabled: false,
      });

      expect(replaced.campaign.name).toBe("New event");
      expect(replaced.lottery.id).not.toBe(first.lottery.id);
      expect(replaced.lots).toEqual([]);

      const current = await getCurrentEventForDb(db);
      expect(current?.campaign.name).toBe("New event");

      const draws = await db.query.drawTable.findMany();
      expect(draws).toHaveLength(0);
    } finally {
      sqlite.close();
    }
  });

  test("restockLot bumps total when remaining exceeds previous total", async () => {
    const { db, sqlite } = createTestDb();

    try {
      await createEventForDb(db, {
        name: "Stock event",
        noWinWeight: 1,
        winCooldownMinutes: 0,
        printLoserTicket: false,
        enabled: false,
      });

      const withLot = await createLotForDb(db, {
        winDescription: "drink",
        weight: 2,
        totalQuantity: 3,
        remainingQuantity: 1,
        rarity: "rare",
      });

      const lotId = withLot.lots[0]!.id;
      const restocked = await restockLotForDb(db, {
        lotId,
        remainingQuantity: 10,
      });

      expect(restocked.lots[0]).toMatchObject({
        id: lotId,
        remainingQuantity: 10,
        totalQuantity: 10,
      });
    } finally {
      sqlite.close();
    }
  });

  test("updateLotterySettings enables the current lottery and disables others", async () => {
    const { db, sqlite } = createTestDb();

    try {
      const event = await createEventForDb(db, {
        name: "Enable event",
        noWinWeight: 1,
        winCooldownMinutes: 0,
        printLoserTicket: false,
        enabled: false,
      });

      await db.insert(lotteryTable).values({
        id: "orphan_lottery",
        enabled: true,
        noWinWeight: 1,
        winCooldownMinutes: 0,
      });

      const updated = await updateLotterySettingsForDb(db, {
        enabled: true,
        noWinWeight: 40,
        winCooldownMinutes: 5,
        printLoserTicket: true,
      });

      expect(updated.lottery).toMatchObject({
        id: event.lottery.id,
        enabled: true,
        noWinWeight: 40,
        winCooldownMinutes: 5,
        printLoserTicket: true,
      });

      const orphan = await db.query.lotteryTable.findFirst({
        where: eq(lotteryTable.id, "orphan_lottery"),
      });
      expect(orphan?.enabled).toBe(false);
    } finally {
      sqlite.close();
    }
  });

  test("deleteLot blocks prizes referenced by draws", async () => {
    const { db, sqlite } = createTestDb();

    try {
      const event = await createEventForDb(db, {
        name: "History event",
        noWinWeight: 1,
        winCooldownMinutes: 0,
        printLoserTicket: false,
        enabled: false,
      });

      const withLot = await createLotForDb(db, {
        winDescription: "legendary prize",
        weight: 1,
        totalQuantity: 1,
        remainingQuantity: 1,
        rarity: "legendary",
      });

      const lotId = withLot.lots[0]!.id;
      await db.insert(drawTable).values({
        lotteryId: event.lottery.id,
        prizeId: lotId,
      });

      await expect(deleteLotForDb(db, lotId)).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      });
    } finally {
      sqlite.close();
    }
  });
});
