import { parseBoothTicketRef } from "@dither-booth/shared/formatting";
import {
  DEFAULT_TICKET_ITEM_NAMES,
  ticketItemNamesSchema,
} from "@dither-booth/shared/ticket";
import { createId } from "@paralleldrive/cuid2";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, ne } from "drizzle-orm";

import type { DB, DbExecutor, DbTransaction } from "#db/internal/db.types";

import {
  campaignTable,
  drawTable,
  lotteryTable,
  prizeTable,
} from "#db/internal/db.schema";

import type {
  CreateEventInput,
  CreatePrizeInput,
  ListDrawsInput,
  RestockPrizeInput,
  UpdateEventInput,
  UpdatePrizeInput,
  UpdateLotterySettingsInput,
  UpdateTicketItemsInput,
} from "./event.constants";
import type { CurrentEvent, EventPrize, ListDrawsResult } from "./event.types";

const EVENT_PRIZE_COLUMNS = {
  id: prizeTable.id,
  title: prizeTable.title,
  winInstruction: prizeTable.winInstruction,
  weight: prizeTable.weight,
  totalQuantity: prizeTable.totalQuantity,
  remainingQuantity: prizeTable.remainingQuantity,
  rarity: prizeTable.rarity,
};

function readTicketItemNames(value: unknown): string[] {
  const parsed = ticketItemNamesSchema.safeParse(value);
  if (!parsed.success) {
    return [...DEFAULT_TICKET_ITEM_NAMES];
  }
  return parsed.data;
}

export async function getCurrentTicketItemNamesForDb(
  db: DB,
): Promise<string[]> {
  const campaign = db
    .select({ ticketItemNames: campaignTable.ticketItemNames })
    .from(campaignTable)
    .get();
  if (!campaign) {
    return [...DEFAULT_TICKET_ITEM_NAMES];
  }
  return readTicketItemNames(campaign.ticketItemNames);
}

function readCurrentEvent(executor: DbExecutor): CurrentEvent | null {
  const campaign = executor.select().from(campaignTable).get();
  if (!campaign?.lotteryId) {
    return null;
  }

  const lottery = executor
    .select()
    .from(lotteryTable)
    .where(eq(lotteryTable.id, campaign.lotteryId))
    .get();
  if (!lottery) {
    return null;
  }

  const prizes = executor
    .select(EVENT_PRIZE_COLUMNS)
    .from(prizeTable)
    .where(
      and(eq(prizeTable.lotteryId, lottery.id), eq(prizeTable.removed, false)),
    )
    .all();

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      ticketItemNames: readTicketItemNames(campaign.ticketItemNames),
    },
    lottery: {
      id: lottery.id,
      enabled: lottery.enabled,
      noWinWeight: lottery.noWinWeight,
      winCooldownMinutes: lottery.winCooldownMinutes,
      printLoserTicket: lottery.printLoserTicket,
    },
    prizes,
  };
}

function requireCurrentEvent(executor: DbExecutor): CurrentEvent {
  const current = readCurrentEvent(executor);
  if (!current) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No event exists. Create an event first.",
    });
  }
  return current;
}

/** The current event plus one of its active prizes, or `NOT_FOUND`. */
function requireCurrentPrize(
  executor: DbExecutor,
  prizeId: string,
): { current: CurrentEvent; prize: EventPrize } {
  const current = requireCurrentEvent(executor);
  const prize = current.prizes.find((entry) => entry.id === prizeId);
  if (!prize) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Prize not found on the current event.",
    });
  }
  return { current, prize };
}

function assertStockUnchanged(
  prize: EventPrize,
  expectedRemainingQuantity: number,
) {
  if (prize.remainingQuantity !== expectedRemainingQuantity) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Stock changed while you were editing (now ${prize.remainingQuantity} left). Reopen the prize and try again.`,
    });
  }
}

/**
 * Runs `write` in one synchronous transaction and returns the event as it
 * stands after the write, so a crash halfway never leaves a partial event.
 */
function writeEvent(db: DB, write: (tx: DbTransaction) => void): CurrentEvent {
  return db.transaction((tx) => {
    write(tx);
    const next = readCurrentEvent(tx);
    if (!next) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to load event after saving.",
      });
    }
    return next;
  });
}

function wipeEventData(tx: DbTransaction): void {
  tx.delete(drawTable).run();
  tx.delete(prizeTable).run();
  tx.update(campaignTable).set({ lotteryId: null }).run();
  tx.delete(lotteryTable).run();
  tx.delete(campaignTable).run();
}

function insertEvent(tx: DbTransaction, input: CreateEventInput): void {
  const existing = tx
    .select({ id: campaignTable.id })
    .from(campaignTable)
    .get();
  if (existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "An event already exists. Replace it instead of creating another.",
    });
  }

  const lotteryId = createId();

  tx.insert(lotteryTable)
    .values({
      id: lotteryId,
      enabled: input.enabled,
      noWinWeight: input.noWinWeight,
      winCooldownMinutes: input.winCooldownMinutes,
      printLoserTicket: input.printLoserTicket,
    })
    .run();

  tx.insert(campaignTable)
    .values({ id: createId(), name: input.name, lotteryId })
    .run();
}

export async function wipeAllEventData(db: DB): Promise<void> {
  db.transaction((tx) => wipeEventData(tx));
}

export async function getCurrentEventForDb(
  db: DB,
): Promise<CurrentEvent | null> {
  return readCurrentEvent(db);
}

export async function createEventForDb(
  db: DB,
  input: CreateEventInput,
): Promise<CurrentEvent> {
  return writeEvent(db, (tx) => insertEvent(tx, input));
}

export async function replaceEventForDb(
  db: DB,
  input: CreateEventInput,
): Promise<CurrentEvent> {
  return writeEvent(db, (tx) => {
    wipeEventData(tx);
    insertEvent(tx, input);
  });
}

export async function updateEventForDb(
  db: DB,
  input: UpdateEventInput,
): Promise<CurrentEvent> {
  return writeEvent(db, (tx) => {
    const current = requireCurrentEvent(tx);
    tx.update(campaignTable)
      .set({ name: input.name })
      .where(eq(campaignTable.id, current.campaign.id))
      .run();
  });
}

export async function updateTicketItemsForDb(
  db: DB,
  input: UpdateTicketItemsInput,
): Promise<CurrentEvent> {
  return writeEvent(db, (tx) => {
    const current = requireCurrentEvent(tx);
    tx.update(campaignTable)
      .set({ ticketItemNames: input.names })
      .where(eq(campaignTable.id, current.campaign.id))
      .run();
  });
}

export async function updateLotterySettingsForDb(
  db: DB,
  input: UpdateLotterySettingsInput,
): Promise<CurrentEvent> {
  return writeEvent(db, (tx) => {
    const current = requireCurrentEvent(tx);

    if (input.enabled) {
      tx.update(lotteryTable)
        .set({ enabled: false })
        .where(ne(lotteryTable.id, current.lottery.id))
        .run();
    }

    tx.update(lotteryTable)
      .set({
        enabled: input.enabled,
        noWinWeight: input.noWinWeight,
        winCooldownMinutes: input.winCooldownMinutes,
        printLoserTicket: input.printLoserTicket,
      })
      .where(eq(lotteryTable.id, current.lottery.id))
      .run();
  });
}

export async function createPrizeForDb(
  db: DB,
  input: CreatePrizeInput,
): Promise<CurrentEvent> {
  return writeEvent(db, (tx) => {
    const current = requireCurrentEvent(tx);
    tx.insert(prizeTable)
      .values({
        lotteryId: current.lottery.id,
        title: input.title,
        winInstruction: input.winInstruction,
        weight: input.weight,
        totalQuantity: input.totalQuantity,
        remainingQuantity: input.remainingQuantity,
        rarity: input.rarity,
      })
      .run();
  });
}

export async function updatePrizeForDb(
  db: DB,
  input: UpdatePrizeInput,
): Promise<CurrentEvent> {
  return writeEvent(db, (tx) => {
    const { prize } = requireCurrentPrize(tx, input.prizeId);
    assertStockUnchanged(prize, input.expectedRemainingQuantity);

    tx.update(prizeTable)
      .set({
        title: input.title,
        winInstruction: input.winInstruction,
        weight: input.weight,
        totalQuantity: input.totalQuantity,
        remainingQuantity: input.remainingQuantity,
        rarity: input.rarity,
      })
      .where(eq(prizeTable.id, prize.id))
      .run();
  });
}

export async function deletePrizeForDb(
  db: DB,
  prizeId: string,
): Promise<CurrentEvent> {
  return writeEvent(db, (tx) => {
    const { prize } = requireCurrentPrize(tx, prizeId);

    // Checked in the same transaction as the delete, so a win cannot land
    // in between and be left pointing at a deleted prize.
    const referencedDraw = tx
      .select({ id: drawTable.id })
      .from(drawTable)
      .where(eq(drawTable.prizeId, prize.id))
      .get();

    if (referencedDraw) {
      // Draws point at the prize row, so a won prize stays stored and leaves the active pool.
      tx.update(prizeTable)
        .set({ removed: true, remainingQuantity: 0 })
        .where(eq(prizeTable.id, prize.id))
        .run();
      return;
    }

    tx.delete(prizeTable).where(eq(prizeTable.id, prize.id)).run();
  });
}

export async function restockPrizeForDb(
  db: DB,
  input: RestockPrizeInput,
): Promise<CurrentEvent> {
  return writeEvent(db, (tx) => {
    const { prize } = requireCurrentPrize(tx, input.prizeId);
    assertStockUnchanged(prize, input.expectedRemainingQuantity);

    const totalQuantity =
      input.totalQuantity ??
      Math.max(prize.totalQuantity, input.remainingQuantity);

    if (input.remainingQuantity > totalQuantity) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "remainingQuantity must be <= totalQuantity",
      });
    }

    tx.update(prizeTable)
      .set({ remainingQuantity: input.remainingQuantity, totalQuantity })
      .where(eq(prizeTable.id, prize.id))
      .run();
  });
}

export async function listDrawsForDb(
  db: DB,
  input: ListDrawsInput,
): Promise<ListDrawsResult> {
  const current = readCurrentEvent(db);
  if (!current) {
    return { draws: [] };
  }

  const parsedTicketRef = input.ticketRef
    ? parseBoothTicketRef(input.ticketRef)
    : null;

  if (input.ticketRef && !parsedTicketRef) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid ticket number.",
    });
  }

  const rows = db
    .select()
    .from(drawTable)
    .where(
      and(
        eq(drawTable.lotteryId, current.lottery.id),
        parsedTicketRef ? eq(drawTable.ticketRef, parsedTicketRef) : undefined,
      ),
    )
    .orderBy(desc(drawTable.createdAt))
    .limit(input.limit)
    .all();

  return {
    draws: rows.map((row) => ({
      id: row.id,
      ticketRef: row.ticketRef,
      createdAt: row.createdAt.toISOString(),
      outcome: row.prizeId ? "win" : "loss",
      prizeTitle: row.prizeId ? row.prizeTitle : null,
    })),
  };
}
