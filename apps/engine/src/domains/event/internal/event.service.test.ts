import { DEFAULT_KIT_ID, KIT_MANIFESTS } from "@dither-booth/shared/kits";
import { DEFAULT_TICKET_ITEM_NAMES } from "@dither-booth/shared/ticket";
import { createId } from "@paralleldrive/cuid2";
import { describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";

import {
  campaignTable,
  drawTable,
  lotteryTable,
  prizeTable,
  stockAdjustmentTable,
} from "#db/internal/db.schema";
import { createTestDb } from "#db/internal/db.test-utils";
import { executeLotteryDraw } from "#domains/lottery/lottery.service";

import { updateKitSettingsInputSchema } from "./event.constants";
import {
  createEventForDb,
  createPrizeForDb,
  deletePrizeForDb,
  getCurrentEventForDb,
  getKitForDb,
  getReceiptEventSettingsForDb,
  listDrawsForDb,
  replaceEventForDb,
  restockPrizeForDb,
  updateEventForDb,
  updateKitSettingsForDb,
  updateLotterySettingsForDb,
  updatePrizeForDb,
  updateTicketItemsForDb,
} from "./event.service";

describe("event.service", () => {
  test("createEvent enforces singleton campaign", async () => {
    const { db, sqlite } = createTestDb();

    try {
      const created = await createEventForDb(db, {
        name: "Launch night",
        kitId: DEFAULT_KIT_ID,
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
          kitId: DEFAULT_KIT_ID,
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

  test("receipts use the default kit and names when no event is active", async () => {
    const { db, sqlite } = createTestDb();

    try {
      expect(await getReceiptEventSettingsForDb(db)).toEqual({
        kitId: DEFAULT_KIT_ID,
        ticketItems: [...DEFAULT_TICKET_ITEM_NAMES],
      });
    } finally {
      sqlite.close();
    }
  });

  test("receipts use the active event's kit and names", async () => {
    const { db, sqlite } = createTestDb();

    try {
      await createEventForDb(db, {
        name: "Launch night",
        kitId: "tartines",
        noWinWeight: 50,
        winCooldownMinutes: 5,
        printLoserTicket: false,
        enabled: false,
      });
      await updateTicketItemsForDb(db, { names: ["Mate"] });

      expect(await getReceiptEventSettingsForDb(db)).toEqual({
        kitId: "tartines",
        ticketItems: ["Mate"],
      });
    } finally {
      sqlite.close();
    }
  });

  test("a kit this release doesn't ship falls back to the default and is logged", async () => {
    const { db, sqlite } = createTestDb();
    const warn = spyOn(console, "warn").mockImplementation(() => {});

    try {
      await createEventForDb(db, {
        name: "Future event",
        kitId: "tartines",
        noWinWeight: 50,
        winCooldownMinutes: 5,
        printLoserTicket: false,
        enabled: false,
      });
      // Set by a newer release, or a kit since removed.
      db.update(campaignTable).set({ kitId: "halloween-2099" }).run();

      expect((await getCurrentEventForDb(db))?.campaign.kitId).toBe(
        DEFAULT_KIT_ID,
      );
      expect((await getReceiptEventSettingsForDb(db)).kitId).toBe(
        DEFAULT_KIT_ID,
      );
      expect(JSON.stringify(warn.mock.calls)).toContain("event-kit-unknown");
      expect(JSON.stringify(warn.mock.calls)).toContain("halloween-2099");
    } finally {
      warn.mockRestore();
      sqlite.close();
    }
  });

  test("updateTicketItems replaces the printed item names", async () => {
    const { db, sqlite } = createTestDb();

    try {
      await createEventForDb(db, {
        name: "Launch night",
        kitId: DEFAULT_KIT_ID,
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

  test("replaceEvent archives the previous event and keeps its history", async () => {
    const { db, sqlite } = createTestDb();

    try {
      const first = await createEventForDb(db, {
        name: "Old event",
        kitId: DEFAULT_KIT_ID,
        noWinWeight: 10,
        winCooldownMinutes: 5,
        printLoserTicket: false,
        enabled: true,
      });

      const withPrize = await createPrizeForDb(db, {
        title: "sticker",
        winInstruction: "Show this ticket at the bar",
        weight: 1,
        quantity: 5,
        rarity: "common",
      });

      await updateTicketItemsForDb(db, {
        names: ["Mate"],
      });

      const oldPrizeId = withPrize.prizes[0]!.id;
      await db.insert(drawTable).values({
        campaignId: first.campaign.id,
        lotteryId: first.lottery.id,
        prizeId: oldPrizeId,
      });

      const replaced = await replaceEventForDb(db, {
        name: "New event",
        kitId: DEFAULT_KIT_ID,
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
      expect(await listDrawsForDb(db, { limit: 50 })).toEqual({ draws: [] });

      // Nothing of the old event is deleted: it is archived as it stood.
      expect(
        db
          .select({
            id: campaignTable.id,
            status: campaignTable.status,
            ticketItemNames: campaignTable.ticketItemNames,
          })
          .from(campaignTable)
          .where(eq(campaignTable.id, first.campaign.id))
          .get(),
      ).toEqual({
        id: first.campaign.id,
        status: "archived",
        ticketItemNames: ["Mate"],
      });
      expect(
        db
          .select({ enabled: lotteryTable.enabled })
          .from(lotteryTable)
          .where(eq(lotteryTable.id, first.lottery.id))
          .get(),
      ).toEqual({ enabled: true });
      expect(
        db.select().from(prizeTable).where(eq(prizeTable.id, oldPrizeId)).all(),
      ).toHaveLength(1);
      expect(
        db
          .select()
          .from(stockAdjustmentTable)
          .where(eq(stockAdjustmentTable.prizeId, oldPrizeId))
          .all(),
      ).toHaveLength(1);
      expect(
        db
          .select()
          .from(drawTable)
          .where(eq(drawTable.campaignId, first.campaign.id))
          .all(),
      ).toHaveLength(1);
    } finally {
      sqlite.close();
    }
  });

  test("restockPrize adds and removes stock by delta, once per adjustment id", async () => {
    const { db, sqlite } = createTestDb();

    try {
      await createEventForDb(db, {
        name: "Stock event",
        kitId: DEFAULT_KIT_ID,
        noWinWeight: 1,
        winCooldownMinutes: 0,
        printLoserTicket: false,
        enabled: false,
      });

      const withPrize = await createPrizeForDb(db, {
        title: "drink",
        winInstruction: "Show this ticket at the bar",
        weight: 2,
        quantity: 1,
        rarity: "rare",
      });

      const prizeId = withPrize.prizes[0]!.id;
      expect(
        db
          .select()
          .from(stockAdjustmentTable)
          .where(eq(stockAdjustmentTable.prizeId, prizeId))
          .all(),
      ).toMatchObject([{ delta: 1, reason: "initial" }]);

      const plus = { prizeId, delta: 9, adjustmentId: createId() };
      await restockPrizeForDb(db, plus);
      // A retry of the same request (same id) is not applied again.
      const retried = await restockPrizeForDb(db, plus);
      expect(retried.prizes[0]).toMatchObject({
        remainingQuantity: 10,
        totalQuantity: 10,
      });

      const minus = await restockPrizeForDb(db, {
        prizeId,
        delta: -4,
        adjustmentId: createId(),
      });
      expect(minus.prizes[0]).toMatchObject({
        remainingQuantity: 6,
        totalQuantity: 6,
      });

      await expect(
        restockPrizeForDb(db, {
          prizeId,
          delta: -7,
          adjustmentId: createId(),
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        restockPrizeForDb(db, { ...plus, delta: 3 }),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      expect(
        db
          .select()
          .from(stockAdjustmentTable)
          .where(eq(stockAdjustmentTable.prizeId, prizeId))
          .all()
          .map((row) => [row.reason, row.delta]),
      ).toEqual([
        ["initial", 1],
        ["restock", 9],
        ["correction", -4],
      ]);
    } finally {
      sqlite.close();
    }
  });

  test("createPrize with no quantity writes no ledger entry", async () => {
    const { db, sqlite } = createTestDb();

    try {
      await createEventForDb(db, {
        name: "Empty prize",
        kitId: DEFAULT_KIT_ID,
        noWinWeight: 1,
        winCooldownMinutes: 0,
        printLoserTicket: false,
        enabled: false,
      });

      const created = await createPrizeForDb(db, {
        title: "later",
        winInstruction: "Show this ticket at the bar",
        weight: 1,
        quantity: 0,
        rarity: "common",
      });

      expect(created.prizes[0]).toMatchObject({
        remainingQuantity: 0,
        totalQuantity: 0,
      });
      expect(db.select().from(stockAdjustmentTable).all()).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  test("updateLotterySettings changes only the current event's lottery", async () => {
    const { db, sqlite } = createTestDb();

    try {
      const event = await createEventForDb(db, {
        name: "Enable event",
        kitId: DEFAULT_KIT_ID,
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

      // Draws only ever use the active event's lottery, so other lotteries
      // keep their flags as a record.
      const orphan = await db.query.lotteryTable.findFirst({
        where: eq(lotteryTable.id, "orphan_lottery"),
      });
      expect(orphan?.enabled).toBe(true);
    } finally {
      sqlite.close();
    }
  });

  test("deletePrize retires prizes referenced by draws and keeps the win", async () => {
    const { db, sqlite } = createTestDb();

    try {
      const event = await createEventForDb(db, {
        name: "History event",
        kitId: DEFAULT_KIT_ID,
        noWinWeight: 1,
        winCooldownMinutes: 0,
        printLoserTicket: false,
        enabled: false,
      });

      const withPrize = await createPrizeForDb(db, {
        title: "legendary prize",
        winInstruction: "Show this ticket at the bar",
        weight: 1,
        quantity: 1,
        rarity: "legendary",
      });

      const prizeId = withPrize.prizes[0]!.id;
      await db.insert(drawTable).values({
        campaignId: event.campaign.id,
        lotteryId: event.lottery.id,
        prizeId: prizeId,
        prizeTitle: "legendary prize",
        ticketRef: "333333",
      });

      const next = await deletePrizeForDb(db, prizeId);
      expect(next.prizes).toEqual([]);

      const stored = await db.query.prizeTable.findFirst({
        where: eq(prizeTable.id, prizeId),
      });
      expect(stored).toMatchObject({
        removed: true,
        title: "legendary prize",
      });

      const draws = await listDrawsForDb(db, { limit: 50 });
      expect(draws.draws).toHaveLength(1);
      expect(draws.draws[0]).toMatchObject({
        outcome: "win",
        prizeTitle: "legendary prize",
        ticketRef: "333333",
      });
    } finally {
      sqlite.close();
    }
  });

  test("deletePrize removes a prize that has no draws", async () => {
    const { db, sqlite } = createTestDb();

    try {
      await createEventForDb(db, {
        name: "Empty history event",
        kitId: DEFAULT_KIT_ID,
        noWinWeight: 1,
        winCooldownMinutes: 0,
        printLoserTicket: false,
        enabled: false,
      });

      const withPrize = await createPrizeForDb(db, {
        title: "unused prize",
        winInstruction: "Show this ticket at the bar",
        weight: 1,
        quantity: 1,
        rarity: "common",
      });

      const prizeId = withPrize.prizes[0]!.id;
      const next = await deletePrizeForDb(db, prizeId);
      expect(next.prizes).toEqual([]);

      const stored = await db.query.prizeTable.findFirst({
        where: eq(prizeTable.id, prizeId),
      });
      expect(stored).toBeUndefined();
      // Its ledger goes with it.
      expect(db.select().from(stockAdjustmentTable).all()).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  test("listDraws returns newest first, looks up a ticket, and misses unknown numbers", async () => {
    const { db, sqlite } = createTestDb();

    try {
      const event = await createEventForDb(db, {
        name: "Draws event",
        kitId: DEFAULT_KIT_ID,
        noWinWeight: 1,
        winCooldownMinutes: 0,
        printLoserTicket: false,
        enabled: false,
      });

      const withPrize = await createPrizeForDb(db, {
        title: "sticker",
        winInstruction: "Show this ticket at the bar",
        weight: 1,
        quantity: 5,
        rarity: "common",
      });

      const prizeId = withPrize.prizes[0]!.id;

      await db.insert(drawTable).values({
        campaignId: event.campaign.id,
        lotteryId: event.lottery.id,
        prizeId: prizeId,
        prizeTitle: "sticker",
        ticketRef: "111111",
        createdAt: new Date("2026-01-01T10:00:00.000Z"),
      });
      // A loss recorded while the lottery was off has no lottery, and still
      // belongs to the event.
      await db.insert(drawTable).values({
        campaignId: event.campaign.id,
        lotteryId: null,
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

describe("event.service — kiosk concurrency and history", () => {
  const PRIZE_FIELDS = {
    title: "sticker",
    winInstruction: "Show this ticket at the bar",
    weight: 1,
    rarity: "common" as const,
  };
  const PRIZE_INPUT = { ...PRIZE_FIELDS, quantity: 5 };

  async function setupLiveEvent() {
    const { db, sqlite } = createTestDb();
    await createEventForDb(db, {
      name: "Live event",
      kitId: DEFAULT_KIT_ID,
      noWinWeight: 0,
      winCooldownMinutes: 0,
      printLoserTicket: false,
      enabled: true,
    });
    const withPrize = await createPrizeForDb(db, PRIZE_INPUT);
    const prize = withPrize.prizes[0]!;
    const kioskWin = () =>
      executeLotteryDraw({ db, force: null, random: () => 0 });

    return { db, sqlite, prize, kioskWin };
  }

  test("updatePrize never touches stock, so it cannot undo a kiosk win", async () => {
    const { db, sqlite, prize, kioskWin } = await setupLiveEvent();

    try {
      // Admin opens the form at 5 left, a visitor wins, admin saves.
      const win = await kioskWin();
      expect(win.result.outcome).toBe("win");

      const saved = await updatePrizeForDb(db, {
        ...PRIZE_FIELDS,
        prizeId: prize.id,
        title: "renamed",
      });
      expect(saved.prizes[0]).toMatchObject({
        title: "renamed",
        remainingQuantity: 4,
        totalQuantity: 5,
      });
    } finally {
      sqlite.close();
    }
  });

  test("a restock after a kiosk win adds to what is left", async () => {
    const { db, sqlite, prize, kioskWin } = await setupLiveEvent();

    try {
      // Admin opens the dialog at 5 left and asks for +3, a visitor wins
      // before the request lands: both changes count.
      await kioskWin();

      const restocked = await restockPrizeForDb(db, {
        prizeId: prize.id,
        delta: 3,
        adjustmentId: createId(),
      });
      expect(restocked.prizes[0]).toMatchObject({
        remainingQuantity: 7,
        totalQuantity: 8,
      });
    } finally {
      sqlite.close();
    }
  });

  test("editing a won prize leaves past draws showing the title they won", async () => {
    const { db, sqlite, prize, kioskWin } = await setupLiveEvent();

    try {
      const win = await kioskWin();

      await updatePrizeForDb(db, {
        ...PRIZE_FIELDS,
        prizeId: prize.id,
        title: "a different prize",
        rarity: "legendary",
      });

      const draws = await listDrawsForDb(db, { limit: 50 });
      expect(draws.draws).toEqual([
        expect.objectContaining({
          ticketRef: win.ticketRef,
          outcome: "win",
          prizeTitle: "sticker",
        }),
      ]);
    } finally {
      sqlite.close();
    }
  });

  test("deletePrize after a real kiosk win soft-deletes and keeps the draw", async () => {
    const { db, sqlite, prize, kioskWin } = await setupLiveEvent();

    try {
      const win = await kioskWin();
      const next = await deletePrizeForDb(db, prize.id);

      expect(next.prizes).toEqual([]);
      expect(
        db.select().from(prizeTable).where(eq(prizeTable.id, prize.id)).get(),
      ).toMatchObject({ removed: true });
      // The ledger stays as the prize's stock history.
      expect(
        db
          .select()
          .from(stockAdjustmentTable)
          .where(eq(stockAdjustmentTable.prizeId, prize.id))
          .all(),
      ).toHaveLength(1);

      const draws = await listDrawsForDb(db, { limit: 50 });
      expect(draws.draws[0]).toMatchObject({
        ticketRef: win.ticketRef,
        prizeTitle: "sticker",
      });

      // A removed prize is gone for the admin and for the kiosk.
      await expect(
        updatePrizeForDb(db, { ...PRIZE_FIELDS, prizeId: prize.id }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await kioskWin()).result.outcome).toBe("loss");
    } finally {
      sqlite.close();
    }
  });

  test("foreign keys are enforced, so a won prize cannot be hard-deleted", async () => {
    const { db, sqlite, prize, kioskWin } = await setupLiveEvent();

    try {
      expect(
        sqlite.query<{ foreign_keys: number }, []>("PRAGMA foreign_keys").get()
          ?.foreign_keys,
      ).toBe(1);

      await kioskWin();

      expect(() =>
        db.delete(prizeTable).where(eq(prizeTable.id, prize.id)).run(),
      ).toThrow(/FOREIGN KEY/);
      expect(() =>
        db
          .insert(drawTable)
          // A missing lottery, not a missing prize: a win on an unknown
          // prize is stopped earlier by the out-of-stock trigger.
          .values({ lotteryId: "no-such-lottery", ticketRef: "777777" })
          .run(),
      ).toThrow(/FOREIGN KEY/);
    } finally {
      sqlite.close();
    }
  });

  test("replaceEvent is atomic: a failing create keeps the old event and its draws", async () => {
    const { db, sqlite, kioskWin } = await setupLiveEvent();

    try {
      await kioskWin();

      // Passes the API schema boundary only because the service is called
      // directly; the DB CHECK constraint rejects it after the archive ran.
      await expect(
        replaceEventForDb(db, {
          name: "Broken",
          kitId: DEFAULT_KIT_ID,
          noWinWeight: -1,
          winCooldownMinutes: 0,
          printLoserTicket: false,
          enabled: false,
        }),
      ).rejects.toThrow();

      const current = await getCurrentEventForDb(db);
      expect(current?.campaign.name).toBe("Live event");
      expect(current?.prizes).toHaveLength(1);
      expect(
        db.select({ status: campaignTable.status }).from(campaignTable).all(),
      ).toEqual([{ status: "active" }]);
      expect(db.select().from(drawTable).all()).toHaveLength(1);
    } finally {
      sqlite.close();
    }
  });

  test("createEvent conflict leaves no stray lottery rows", async () => {
    const { db, sqlite } = await setupLiveEvent();

    try {
      await expect(
        createEventForDb(db, {
          name: "Second",
          kitId: DEFAULT_KIT_ID,
          noWinWeight: 1,
          winCooldownMinutes: 0,
          printLoserTicket: false,
          enabled: false,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      expect(db.select().from(lotteryTable).all()).toHaveLength(1);
      expect(db.select().from(campaignTable).all()).toHaveLength(1);
    } finally {
      sqlite.close();
    }
  });

  test("updateEvent returns the stored event", async () => {
    const { db, sqlite } = await setupLiveEvent();

    try {
      const updated = await updateEventForDb(db, { name: "Renamed" });

      expect(updated).toEqual((await getCurrentEventForDb(db))!);
      expect(updated.campaign.name).toBe("Renamed");
    } finally {
      sqlite.close();
    }
  });

  test("updateKitSettings saves the kit and its edits together", async () => {
    const { db, sqlite } = await setupLiveEvent();

    try {
      const updated = await updateKitSettingsForDb(db, {
        kitId: "tartines",
        settings: { copy: { "landing.start": "Tap to scare" } },
      });

      expect(updated).toEqual((await getCurrentEventForDb(db))!);
      expect(updated.campaign.kitSettings).toEqual({
        copy: { "landing.start": "Tap to scare" },
      });

      const kit = await getKitForDb(db);
      expect(kit.kitId).toBe("tartines");
      expect(kit.copy["landing.start"]).toBe("Tap to scare");
      expect(kit.copy["prompts.printing"]).toBe(
        KIT_MANIFESTS.tartines.copy["prompts.printing"],
      );

      // Kits are free text in the database; the API only accepts shipped
      // ones, and only copy keys and lengths it knows.
      for (const input of [
        { kitId: "halloween-2099", settings: {} },
        { kitId: "tartines", settings: { copy: { "landing.nope": "x" } } },
        {
          kitId: "tartines",
          settings: { copy: { "landing.start": "x".repeat(200) } },
        },
      ]) {
        expect(updateKitSettingsInputSchema.safeParse(input).success).toBe(
          false,
        );
      }
    } finally {
      sqlite.close();
    }
  });

  test("a stored kit edit this release can't use falls back and is logged", async () => {
    const { db, sqlite } = await setupLiveEvent();
    const warn = spyOn(console, "warn").mockImplementation(() => {});

    try {
      // Written by a newer release, with a key and a limit this one lacks.
      db.update(campaignTable)
        .set({
          kitSettings: {
            copy: {
              "landing.start": "Go",
              "landing.fromTheFuture": "x",
              "prompts.printing": "x".repeat(500),
            },
          },
        })
        .run();

      const kit = await getKitForDb(db);
      expect(kit.copy["landing.start"]).toBe("Go");
      expect(kit.copy["prompts.printing"]).toBe(
        KIT_MANIFESTS.tartines.copy["prompts.printing"],
      );
      expect((await getCurrentEventForDb(db))?.campaign.kitSettings).toEqual({
        copy: { "landing.start": "Go" },
      });
      expect(JSON.stringify(warn.mock.calls)).toContain(
        "event-kit-settings-ignored",
      );
    } finally {
      warn.mockRestore();
      sqlite.close();
    }
  });

  test("with no event, the kiosk gets the default kit", async () => {
    const { db, sqlite } = createTestDb();

    try {
      expect(await getKitForDb(db)).toEqual({
        kitId: DEFAULT_KIT_ID,
        copy: KIT_MANIFESTS[DEFAULT_KIT_ID].copy,
      });
    } finally {
      sqlite.close();
    }
  });

  test("an archived event does not block creating the next one", async () => {
    const { db, sqlite } = await setupLiveEvent();

    try {
      db.update(campaignTable).set({ status: "archived" }).run();
      expect(await getCurrentEventForDb(db)).toBeNull();

      const created = await createEventForDb(db, {
        name: "Next",
        kitId: DEFAULT_KIT_ID,
        noWinWeight: 1,
        winCooldownMinutes: 0,
        printLoserTicket: false,
        enabled: false,
      });

      expect(created.campaign.name).toBe("Next");
      expect(created.prizes).toEqual([]);
      expect(db.select().from(campaignTable).all()).toHaveLength(2);
    } finally {
      sqlite.close();
    }
  });

  test("the database refuses a second active event", async () => {
    const { db, sqlite } = await setupLiveEvent();

    try {
      expect(() =>
        db.insert(campaignTable).values({ name: "Twin" }).run(),
      ).toThrow(/UNIQUE constraint failed: campaign.status/);
      db.insert(campaignTable)
        .values([
          { name: "Old", status: "archived" },
          { name: "Older", status: "archived" },
        ])
        .run();
    } finally {
      sqlite.close();
    }
  });

  test("any change to the event moves its updated_at", async () => {
    const { db, sqlite, prize } = await setupLiveEvent();
    const longAgo = new Date("2020-01-01T00:00:00.000Z");

    try {
      db.update(campaignTable).set({ updatedAt: longAgo }).run();

      await updatePrizeForDb(db, {
        ...PRIZE_FIELDS,
        prizeId: prize.id,
        title: "renamed",
      });

      const campaign = db.select().from(campaignTable).get()!;
      expect(campaign.updatedAt.getTime()).toBeGreaterThan(longAgo.getTime());
      expect(campaign.createdAt.getTime()).toBeLessThanOrEqual(
        campaign.updatedAt.getTime(),
      );
    } finally {
      sqlite.close();
    }
  });

  test("listDraws rejects an invalid ticket number", async () => {
    const { db, sqlite } = await setupLiveEvent();

    try {
      await expect(
        listDrawsForDb(db, { ticketRef: "STUD_12", limit: 50 }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    } finally {
      sqlite.close();
    }
  });

  test("mutations without an event answer NOT_FOUND", async () => {
    const { db, sqlite } = createTestDb();

    try {
      await expect(updateEventForDb(db, { name: "x" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(
        updateKitSettingsForDb(db, { kitId: DEFAULT_KIT_ID, settings: {} }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(createPrizeForDb(db, PRIZE_INPUT)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect(await listDrawsForDb(db, { limit: 50 })).toEqual({ draws: [] });
    } finally {
      sqlite.close();
    }
  });
});
