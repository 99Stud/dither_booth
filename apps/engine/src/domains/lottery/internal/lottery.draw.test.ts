import type { Rarity } from "@dither-booth/shared/lottery";

import { afterEach, describe, expect, spyOn, test } from "bun:test";

import type { DB } from "#db/internal/db.types";

import {
  drawTable,
  lotteryTable,
  stockAdjustmentTable,
} from "#db/internal/db.schema";
import { createTestDb } from "#db/internal/db.test-utils";

import { executeLotteryDraw } from "./lottery.draw";
import { insertPrizeWithStock, stockOf } from "./lottery.test-utils";

const TICKET_REF_PATTERN = /^\d{6}$/;
const MINUTE_MS = 60_000;
/** `random` that always lands on the first eligible prize. */
const ALWAYS_FIRST_PRIZE = () => 0;
/** `random` that always lands past every prize weight, on the no-win slot. */
const ALWAYS_NO_WIN = () => 0.999_999;

const openDbs: Array<{ close: () => void }> = [];

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close();
});

function setup(
  options: {
    enabled?: boolean;
    noWinWeight?: number;
    winCooldownMinutes?: number;
    printLoserTicket?: boolean;
  } = {},
) {
  const { db, sqlite } = createTestDb();
  openDbs.push(sqlite);

  db.insert(lotteryTable)
    .values({
      id: "lottery-1",
      enabled: options.enabled ?? true,
      noWinWeight: options.noWinWeight ?? 0,
      winCooldownMinutes: options.winCooldownMinutes ?? 0,
      printLoserTicket: options.printLoserTicket ?? false,
    })
    .run();

  return db;
}

function addPrize(
  db: DB,
  prize: {
    id: string;
    remainingQuantity: number;
    weight?: number;
    rarity?: Rarity;
    removed?: boolean;
    lotteryId?: string;
  },
) {
  insertPrizeWithStock(
    db,
    {
      id: prize.id,
      lotteryId: prize.lotteryId ?? "lottery-1",
      title: `Title ${prize.id}`,
      winInstruction: "Show this ticket at the bar",
      weight: prize.weight ?? 1,
      rarity: prize.rarity ?? "common",
      removed: prize.removed ?? false,
    },
    prize.remainingQuantity,
  );
}

const remainingOf = (db: DB, prizeId: string) =>
  stockOf(db, prizeId)?.remainingQuantity;

const allDraws = (db: DB) => db.select().from(drawTable).all();

const draw = (
  db: DB,
  options: Partial<Parameters<typeof executeLotteryDraw>[0]> = {},
) => executeLotteryDraw({ db, force: null, ...options });

describe("executeLotteryDraw — weighted draw", () => {
  test("records a loss with no lottery when none is enabled", async () => {
    const db = setup({ enabled: false });
    addPrize(db, { id: "p1", remainingQuantity: 5 });

    const execution = await draw(db, { random: ALWAYS_FIRST_PRIZE });

    expect(execution.result).toEqual({ outcome: "loss", prize: null });
    expect(execution.printLoserTicket).toBe(false);
    expect(execution.ticketRef).toMatch(TICKET_REF_PATTERN);
    expect(allDraws(db)).toMatchObject([
      { lotteryId: null, prizeId: null, ticketRef: execution.ticketRef },
    ]);
    expect(remainingOf(db, "p1")).toBe(5);
  });

  test("a win takes one unit of stock and snapshots the prize title", async () => {
    const db = setup({ printLoserTicket: true });
    addPrize(db, { id: "p1", remainingQuantity: 3, rarity: "epic" });

    const execution = await draw(db, {
      random: ALWAYS_FIRST_PRIZE,
      ticketRef: "123456",
    });

    expect(execution).toEqual({
      result: {
        outcome: "win",
        prize: {
          id: "p1",
          rarity: "epic",
          title: "Title p1",
          winInstruction: "Show this ticket at the bar",
        },
      },
      ticketRef: "123456",
      printLoserTicket: true,
    });
    expect(remainingOf(db, "p1")).toBe(2);
    expect(allDraws(db)).toMatchObject([
      {
        lotteryId: "lottery-1",
        prizeId: "p1",
        prizeTitle: "Title p1",
        ticketRef: "123456",
      },
    ]);
  });

  test("a loss leaves stock alone and reports the lottery's printLoserTicket", async () => {
    const db = setup({ noWinWeight: 10, printLoserTicket: true });
    addPrize(db, { id: "p1", remainingQuantity: 3 });

    const execution = await draw(db, { random: ALWAYS_NO_WIN });

    expect(execution.result.outcome).toBe("loss");
    expect(execution.printLoserTicket).toBe(true);
    expect(remainingOf(db, "p1")).toBe(3);
    expect(allDraws(db)).toMatchObject([
      { lotteryId: "lottery-1", prizeId: null, prizeTitle: null },
    ]);
  });

  test("never draws an out-of-stock or removed prize", async () => {
    const db = setup();
    addPrize(db, { id: "empty", remainingQuantity: 0 });
    addPrize(db, { id: "removed", remainingQuantity: 4, removed: true });
    addPrize(db, { id: "live", remainingQuantity: 1 });

    const first = await draw(db, { random: ALWAYS_FIRST_PRIZE });
    expect(first.result.prize?.id).toBe("live");

    // Only zero-stock and removed prizes remain, and noWinWeight is 0.
    const second = await draw(db, { random: ALWAYS_FIRST_PRIZE });
    expect(second.result.outcome).toBe("loss");

    expect(remainingOf(db, "empty")).toBe(0);
    expect(remainingOf(db, "removed")).toBe(4);
    expect(remainingOf(db, "live")).toBe(0);
  });

  test("stock never goes negative and wins match the stock taken", async () => {
    const db = setup();
    addPrize(db, { id: "p1", remainingQuantity: 3 });

    const executions = await Promise.all(
      Array.from({ length: 20 }, () =>
        draw(db, { random: ALWAYS_FIRST_PRIZE }),
      ),
    );

    const wins = executions.filter((e) => e.result.outcome === "win");
    expect(wins).toHaveLength(3);
    expect(remainingOf(db, "p1")).toBe(0);
    expect(allDraws(db).filter((row) => row.prizeId === "p1")).toHaveLength(3);
    expect(allDraws(db)).toHaveLength(20);
  });

  test("concurrent visits cannot both win inside one cooldown window", async () => {
    const db = setup({ winCooldownMinutes: 5 });
    addPrize(db, { id: "p1", remainingQuantity: 50 });

    const executions = await Promise.all(
      Array.from({ length: 10 }, () =>
        draw(db, { random: ALWAYS_FIRST_PRIZE }),
      ),
    );

    expect(executions.filter((e) => e.result.outcome === "win")).toHaveLength(
      1,
    );
    expect(remainingOf(db, "p1")).toBe(49);
  });

  test("wins again once the cooldown has elapsed", async () => {
    const db = setup({ winCooldownMinutes: 5 });
    addPrize(db, { id: "p1", remainingQuantity: 50 });

    const first = await draw(db, { random: ALWAYS_FIRST_PRIZE });
    const withinCooldown = await draw(db, {
      random: ALWAYS_FIRST_PRIZE,
      now: new Date(Date.now() + 4 * MINUTE_MS),
    });
    const afterCooldown = await draw(db, {
      random: ALWAYS_FIRST_PRIZE,
      now: new Date(Date.now() + 6 * MINUTE_MS),
    });

    expect(first.result.outcome).toBe("win");
    expect(withinCooldown.result.outcome).toBe("loss");
    expect(afterCooldown.result.outcome).toBe("win");
    expect(remainingOf(db, "p1")).toBe(48);
  });

  test("ignores wins recorded against another lottery for the cooldown", async () => {
    const db = setup({ winCooldownMinutes: 60 });
    db.insert(lotteryTable).values({ id: "lottery-old", enabled: false }).run();
    addPrize(db, { id: "old", remainingQuantity: 1, lotteryId: "lottery-old" });
    db.insert(drawTable)
      .values({ lotteryId: "lottery-old", prizeId: "old", ticketRef: "111111" })
      .run();
    addPrize(db, { id: "p1", remainingQuantity: 1 });

    const execution = await draw(db, { random: ALWAYS_FIRST_PRIZE });

    expect(execution.result.prize?.id).toBe("p1");
  });

  test("moves to a fresh ticket ref when the preferred one is taken", async () => {
    const db = setup();
    addPrize(db, { id: "p1", remainingQuantity: 5 });

    const first = await draw(db, {
      random: ALWAYS_FIRST_PRIZE,
      ticketRef: "424242",
    });
    const second = await draw(db, {
      random: ALWAYS_FIRST_PRIZE,
      ticketRef: "424242",
    });

    expect(first.ticketRef).toBe("424242");
    expect(second.ticketRef).toMatch(TICKET_REF_PATTERN);
    expect(second.ticketRef).not.toBe("424242");
    expect(
      allDraws(db)
        .map((row) => row.ticketRef)
        .sort(),
    ).toEqual([first.ticketRef, second.ticketRef].sort());
  });

  test("rolls the win back when no ticket ref can be allocated", async () => {
    const db = setup();
    addPrize(db, { id: "p1", remainingQuantity: 5 });

    // Every generated ref is the same, so the second draw collides on all
    // attempts and its whole transaction rolls back.
    const random = spyOn(Math, "random").mockReturnValue(0.5);

    try {
      await draw(db);
      await expect(draw(db)).rejects.toThrow(/ticket_ref/);
    } finally {
      random.mockRestore();
    }

    expect(remainingOf(db, "p1")).toBe(4);
    expect(allDraws(db)).toHaveLength(1);
  });
});

describe("executeLotteryDraw — stock ledger", () => {
  test("a restock between wins adds to what is left", async () => {
    const db = setup();
    addPrize(db, { id: "p1", remainingQuantity: 1 });

    await draw(db, { random: ALWAYS_FIRST_PRIZE });
    expect(stockOf(db, "p1")).toEqual({
      totalQuantity: 1,
      remainingQuantity: 0,
    });

    db.insert(stockAdjustmentTable)
      .values({ id: "restock-1", prizeId: "p1", delta: 2, reason: "restock" })
      .run();

    const second = await draw(db, { random: ALWAYS_FIRST_PRIZE });
    expect(second.result.prize?.id).toBe("p1");
    expect(stockOf(db, "p1")).toEqual({
      totalQuantity: 3,
      remainingQuantity: 1,
    });
  });

  test("remaining always equals allocated stock minus wins", async () => {
    const db = setup({ noWinWeight: 1 });
    addPrize(db, { id: "p1", remainingQuantity: 4 });
    addPrize(db, { id: "p2", remainingQuantity: 2 });

    let roll = 0;
    // Cycles through p1, p2 and the no-win slot.
    const random = () => [0, 0.5, 0.99][roll++ % 3]!;
    for (let i = 0; i < 12; i++) await draw(db, { random });

    for (const prizeId of ["p1", "p2"]) {
      const wins = allDraws(db).filter((row) => row.prizeId === prizeId).length;
      const stock = stockOf(db, prizeId)!;
      expect(stock.remainingQuantity).toBeGreaterThanOrEqual(0);
      expect(stock.remainingQuantity).toBe(stock.totalQuantity - wins);
    }
  });
});

describe("executeLotteryDraw — forced outcomes", () => {
  test("a forced loss is recorded against the enabled lottery", async () => {
    const db = setup({ printLoserTicket: true });
    addPrize(db, { id: "p1", remainingQuantity: 5 });

    const execution = await executeLotteryDraw({
      db,
      force: { outcome: "loss" },
      random: ALWAYS_FIRST_PRIZE,
    });

    expect(execution.result).toEqual({ outcome: "loss", prize: null });
    expect(execution.printLoserTicket).toBe(true);
    expect(allDraws(db)).toMatchObject([
      { lotteryId: "lottery-1", prizeId: null },
    ]);
    expect(remainingOf(db, "p1")).toBe(5);
  });

  test("a forced win skips cooldown and enabled but takes stock", async () => {
    const db = setup({ enabled: false, winCooldownMinutes: 60 });
    addPrize(db, { id: "p1", remainingQuantity: 2, rarity: "rare" });

    const first = await executeLotteryDraw({
      db,
      force: { outcome: "win", prizeId: "p1" },
      ticketRef: "123456",
    });
    const second = await executeLotteryDraw({
      db,
      force: { outcome: "win", prizeId: "p1" },
    });

    expect(first).toEqual({
      ticketRef: "123456",
      printLoserTicket: false,
      result: {
        outcome: "win",
        prize: {
          id: "p1",
          rarity: "rare",
          title: "Title p1",
          winInstruction: "Show this ticket at the bar",
        },
      },
    });
    expect(second.result.outcome).toBe("win");
    expect(remainingOf(db, "p1")).toBe(0);
    expect(allDraws(db)).toMatchObject([
      { prizeId: "p1", prizeTitle: "Title p1" },
      { prizeId: "p1", prizeTitle: "Title p1" },
    ]);
  });

  test("a forced win on an out-of-stock prize fails without recording", async () => {
    const db = setup();
    addPrize(db, { id: "p1", remainingQuantity: 0 });

    await expect(
      executeLotteryDraw({ db, force: { outcome: "win", prizeId: "p1" } }),
    ).rejects.toThrow(/out of stock/);
    expect(allDraws(db)).toHaveLength(0);
  });

  test("a forced win on a missing or removed prize fails without recording", async () => {
    const db = setup();
    addPrize(db, { id: "gone", remainingQuantity: 3, removed: true });

    await expect(
      executeLotteryDraw({
        db,
        force: { outcome: "win", prizeId: "missing-prize" },
      }),
    ).rejects.toThrow(/Forced lottery prize not found/);
    await expect(
      executeLotteryDraw({ db, force: { outcome: "win", prizeId: "gone" } }),
    ).rejects.toThrow(/Forced lottery prize not found/);
    expect(allDraws(db)).toHaveLength(0);
    expect(remainingOf(db, "gone")).toBe(3);
  });
});
