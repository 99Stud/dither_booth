import { DEFAULT_TICKET_ITEM_NAMES } from "@dither-booth/shared/routes";
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
  createPrizeForDb,
  deletePrizeForDb,
  getCurrentEventForDb,
  getCurrentTicketItemNamesForDb,
  listDrawsForDb,
  replaceEventForDb,
  restockPrizeForDb,
  updateLotterySettingsForDb,
  updateTicketItemsForDb,
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
      expect(created.campaign.ticketItemNames).toEqual([
        ...DEFAULT_TICKET_ITEM_NAMES,
      ]);
      expect(created.lottery.enabled).toBe(false);
      expect(created.lottery.printLoserTicket).toBe(false);
      expect(created.prizes).toEqual([]);

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

  test("getCurrentTicketItemNamesForDb uses the default names when no event exists", async () => {
    const { db, sqlite } = createTestDb();

    try {
      expect(await getCurrentTicketItemNamesForDb(db)).toEqual([
        ...DEFAULT_TICKET_ITEM_NAMES,
      ]);
    } finally {
      sqlite.close();
    }
  });

  test("updateTicketItems replaces the printed item names", async () => {
    const { db, sqlite } = createTestDb();

    try {
      await createEventForDb(db, {
        name: "Launch night",
        noWinWeight: 50,
        winCooldownMinutes: 5,
        printLoserTicket: false,
        enabled: false,
      });

      const updated = await updateTicketItemsForDb(db, {
        names: ["Mate", "Ginette"],
      });

      expect(updated.campaign.ticketItemNames).toEqual(["Mate", "Ginette"]);

      const current = await getCurrentEventForDb(db);
      expect(current?.campaign.ticketItemNames).toEqual(["Mate", "Ginette"]);
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

      const withPrize = await createPrizeForDb(db, {
        title: "sticker",
        winInstruction: "Show this ticket at the bar",
        weight: 1,
        totalQuantity: 5,
        remainingQuantity: 5,
        rarity: "common",
      });

      await updateTicketItemsForDb(db, {
        names: ["Mate"],
      });

      await db.insert(drawTable).values({
        lotteryId: first.lottery.id,
        prizeId: withPrize.prizes[0]!.id,
      });

      const replaced = await replaceEventForDb(db, {
        name: "New event",
        noWinWeight: 20,
        winCooldownMinutes: 0,
        printLoserTicket: false,
        enabled: false,
      });

      expect(replaced.campaign.name).toBe("New event");
      expect(replaced.campaign.ticketItemNames).toEqual([
        ...DEFAULT_TICKET_ITEM_NAMES,
      ]);
      expect(replaced.lottery.id).not.toBe(first.lottery.id);
      expect(replaced.prizes).toEqual([]);

      const current = await getCurrentEventForDb(db);
      expect(current?.campaign.name).toBe("New event");

      const draws = await db.query.drawTable.findMany();
      expect(draws).toHaveLength(0);
    } finally {
      sqlite.close();
    }
  });

  test("restockPrize bumps total when remaining exceeds previous total", async () => {
    const { db, sqlite } = createTestDb();

    try {
      await createEventForDb(db, {
        name: "Stock event",
        noWinWeight: 1,
        winCooldownMinutes: 0,
        printLoserTicket: false,
        enabled: false,
      });

      const withPrize = await createPrizeForDb(db, {
        title: "drink",
        winInstruction: "Show this ticket at the bar",
        weight: 2,
        totalQuantity: 3,
        remainingQuantity: 1,
        rarity: "rare",
      });

      const prizeId = withPrize.prizes[0]!.id;
      const restocked = await restockPrizeForDb(db, {
        prizeId,
        remainingQuantity: 10,
      });

      expect(restocked.prizes[0]).toMatchObject({
        id: prizeId,
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

  test("deletePrize blocks prizes referenced by draws", async () => {
    const { db, sqlite } = createTestDb();

    try {
      const event = await createEventForDb(db, {
        name: "History event",
        noWinWeight: 1,
        winCooldownMinutes: 0,
        printLoserTicket: false,
        enabled: false,
      });

      const withPrize = await createPrizeForDb(db, {
        title: "legendary prize",
        winInstruction: "Show this ticket at the bar",
        weight: 1,
        totalQuantity: 1,
        remainingQuantity: 1,
        rarity: "legendary",
      });

      const prizeId = withPrize.prizes[0]!.id;
      await db.insert(drawTable).values({
        lotteryId: event.lottery.id,
        prizeId: prizeId,
      });

      await expect(deletePrizeForDb(db, prizeId)).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      });
    } finally {
      sqlite.close();
    }
  });

  test("listDraws returns newest first, looks up a ticket, and misses unknown numbers", async () => {
    const { db, sqlite } = createTestDb();

    try {
      const event = await createEventForDb(db, {
        name: "Draws event",
        noWinWeight: 1,
        winCooldownMinutes: 0,
        printLoserTicket: false,
        enabled: false,
      });

      const withPrize = await createPrizeForDb(db, {
        title: "sticker",
        winInstruction: "Show this ticket at the bar",
        weight: 1,
        totalQuantity: 5,
        remainingQuantity: 5,
        rarity: "common",
      });

      const prizeId = withPrize.prizes[0]!.id;

      await db.insert(drawTable).values({
        lotteryId: event.lottery.id,
        prizeId: prizeId,
        ticketRef: "111111",
        createdAt: new Date("2026-01-01T10:00:00.000Z"),
      });
      await db.insert(drawTable).values({
        lotteryId: event.lottery.id,
        prizeId: null,
        ticketRef: "222222",
        createdAt: new Date("2026-01-01T11:00:00.000Z"),
      });

      const latest = await listDrawsForDb(db, { limit: 50 });
      expect(latest.draws.map((draw) => draw.ticketRef)).toEqual([
        "222222",
        "111111",
      ]);
      expect(latest.draws[0]).toMatchObject({
        outcome: "loss",
        prizeTitle: null,
        ticketRef: "222222",
      });
      expect(latest.draws[1]).toMatchObject({
        outcome: "win",
        prizeTitle: "sticker",
        ticketRef: "111111",
      });

      const lookup = await listDrawsForDb(db, {
        ticketRef: "STUD_DITHERBOOTH_111111",
        limit: 50,
      });
      expect(lookup.draws).toHaveLength(1);
      expect(lookup.draws[0]).toMatchObject({
        ticketRef: "111111",
        outcome: "win",
        prizeTitle: "sticker",
      });

      const miss = await listDrawsForDb(db, {
        ticketRef: "999999",
        limit: 50,
      });
      expect(miss.draws).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
});
