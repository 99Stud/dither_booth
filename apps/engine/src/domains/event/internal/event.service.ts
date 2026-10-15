import { parseBoothTicketRef } from "@dither-booth/shared/formatting";
import {
  DEFAULT_TICKET_ITEM_NAMES,
  ticketItemNamesSchema,
} from "@dither-booth/shared/ticket";
import { createId } from "@paralleldrive/cuid2";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";

import type { DB, DbExecutor, DbTransaction } from "#db/internal/db.types";

import {
  campaignTable,
  drawTable,
  lotteryTable,
  prizeTable,
  stockAdjustmentTable,
} from "#db/internal/db.schema";
import {
  applyStockAdjustment,
  prizeStockColumns,
} from "#domains/lottery/lottery.service";

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

const isActiveCampaign = eq(campaignTable.status, "active");

const EVENT_PRIZE_COLUMNS = {
  id: prizeTable.id,
  title: prizeTable.title,
  winInstruction: prizeTable.winInstruction,
  weight: prizeTable.weight,
  rarity: prizeTable.rarity,
  ...prizeStockColumns,
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
    .where(isActiveCampaign)
    .get();
  if (!campaign) {
    return [...DEFAULT_TICKET_ITEM_NAMES];
  }
  return readTicketItemNames(campaign.ticketItemNames);
}

function readCurrentEvent(executor: DbExecutor): CurrentEvent | null {
  const campaign = executor
    .select()
    .from(campaignTable)
    .where(isActiveCampaign)
    .get();
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

/**
 * Runs `write` in one synchronous transaction and returns the event as it
 * stands after the write, so a crash halfway never leaves a partial event.
 * Every write moves the active event's `updated_at`, whichever of its tables
 * it touched.
 */
function writeEvent(db: DB, write: (tx: DbTransaction) => void): CurrentEvent {
  return db.transaction((tx) => {
    write(tx);
    tx.update(campaignTable)
      .set({ updatedAt: new Date() })
      .where(isActiveCampaign)
      .run();
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

/**
 * Takes the active event out of play. Its lottery, prizes, stock ledger and
 * draws are left exactly as they were, as the record of that event.
 */
function archiveActiveEvent(tx: DbTransaction): void {
  tx.update(campaignTable)
    .set({ status: "archived", updatedAt: new Date() })
    .where(isActiveCampaign)
    .run();
}

function insertEvent(tx: DbTransaction, input: CreateEventInput): void {
  const existing = tx
    .select({ id: campaignTable.id })
    .from(campaignTable)
    .where(isActiveCampaign)
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
    archiveActiveEvent(tx);
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
    // Only the active event's lottery is ever drawn against, so an archived
    // event's lottery can keep its `enabled` flag as a record.
    const current = requireCurrentEvent(tx);

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
    const prizeId = createId();
    tx.insert(prizeTable)
      .values({
        id: prizeId,
        lotteryId: current.lottery.id,
        title: input.title,
        winInstruction: input.winInstruction,
        weight: input.weight,
        rarity: input.rarity,
      })
      .run();

    if (input.quantity > 0) {
      applyStockAdjustment(tx, {
        id: createId(),
        prizeId,
        delta: input.quantity,
        reason: "initial",
      });
    }
  });
}

export async function updatePrizeForDb(
  db: DB,
  input: UpdatePrizeInput,
): Promise<CurrentEvent> {
  return writeEvent(db, (tx) => {
    // Stock is not part of a prize edit: it only moves through
    // `restockPrizeForDb`, so an edit can never overwrite kiosk wins.
    const { prize } = requireCurrentPrize(tx, input.prizeId);

    tx.update(prizeTable)
      .set({
        title: input.title,
        winInstruction: input.winInstruction,
        weight: input.weight,
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
      // Draws point at the prize row, so a won prize stays stored and leaves
      // the active pool. Its ledger stays too, as the history of its stock.
      tx.update(prizeTable)
        .set({ removed: true })
        .where(eq(prizeTable.id, prize.id))
        .run();
      return;
    }

    tx.delete(stockAdjustmentTable)
      .where(eq(stockAdjustmentTable.prizeId, prize.id))
      .run();
    tx.delete(prizeTable).where(eq(prizeTable.id, prize.id)).run();
  });
}

/**
 * Adds or removes stock by a delta. Deltas commute with kiosk wins, so there
 * is nothing to go stale between opening the form and saving it, and the
 * caller's `adjustmentId` makes a retried request apply once.
 */
export async function restockPrizeForDb(
  db: DB,
  input: RestockPrizeInput,
): Promise<CurrentEvent> {
  return writeEvent(db, (tx) => {
    const { prize } = requireCurrentPrize(tx, input.prizeId);

    applyStockAdjustment(tx, {
      id: input.adjustmentId,
      prizeId: prize.id,
      delta: input.delta,
      reason: input.delta > 0 ? "restock" : "correction",
    });
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
        eq(drawTable.campaignId, current.campaign.id),
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
