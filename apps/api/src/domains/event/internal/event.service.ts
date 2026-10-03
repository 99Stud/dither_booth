import { parseBoothTicketRef } from "@dither-booth/shared/formatting";
import {
  DEFAULT_TICKET_ITEM_NAMES,
  ticketItemNamesSchema,
} from "@dither-booth/shared/routes";
import { createId } from "@paralleldrive/cuid2";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, ne } from "drizzle-orm";

import type { DB } from "#db/internal/db.types";

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
  const campaign = await db.query.campaignTable.findFirst({
    columns: { ticketItemNames: true },
  });
  if (!campaign) {
    return [...DEFAULT_TICKET_ITEM_NAMES];
  }
  return readTicketItemNames(campaign.ticketItemNames);
}

function mapPrize(prize: {
  id: string;
  title: string;
  winInstruction: string;
  weight: number;
  totalQuantity: number;
  remainingQuantity: number;
  rarity: EventPrize["rarity"];
}): EventPrize {
  return {
    id: prize.id,
    title: prize.title,
    winInstruction: prize.winInstruction,
    weight: prize.weight,
    totalQuantity: prize.totalQuantity,
    remainingQuantity: prize.remainingQuantity,
    rarity: prize.rarity,
  };
}

export async function wipeAllEventData(db: DB): Promise<void> {
  await db.delete(drawTable);
  await db.delete(prizeTable);
  await db.update(campaignTable).set({ lotteryId: null });
  await db.delete(lotteryTable);
  await db.delete(campaignTable);
}

export async function getCurrentEventForDb(
  db: DB,
): Promise<CurrentEvent | null> {
  const campaign = await db.query.campaignTable.findFirst();
  if (!campaign?.lotteryId) {
    return null;
  }

  const lottery = await db.query.lotteryTable.findFirst({
    where: eq(lotteryTable.id, campaign.lotteryId),
  });
  if (!lottery) {
    return null;
  }

  const prizes = await db.query.prizeTable.findMany({
    where: and(
      eq(prizeTable.lotteryId, lottery.id),
      eq(prizeTable.removed, false),
    ),
  });

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
    prizes: prizes.map(mapPrize),
  };
}

async function requireCurrentEvent(db: DB): Promise<CurrentEvent> {
  const current = await getCurrentEventForDb(db);
  if (!current) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No event exists. Create an event first.",
    });
  }
  return current;
}

export async function createEventForDb(
  db: DB,
  input: CreateEventInput,
): Promise<CurrentEvent> {
  const existing = await db.query.campaignTable.findFirst();
  if (existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "An event already exists. Replace it instead of creating another.",
    });
  }

  const lotteryId = createId();
  const campaignId = createId();

  await db.insert(lotteryTable).values({
    id: lotteryId,
    enabled: input.enabled,
    noWinWeight: input.noWinWeight,
    winCooldownMinutes: input.winCooldownMinutes,
    printLoserTicket: input.printLoserTicket,
  });

  await db.insert(campaignTable).values({
    id: campaignId,
    name: input.name,
    lotteryId,
  });

  const created = await getCurrentEventForDb(db);
  if (!created) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to load event after create.",
    });
  }
  return created;
}

export async function updateEventForDb(
  db: DB,
  input: UpdateEventInput,
): Promise<CurrentEvent> {
  const current = await requireCurrentEvent(db);

  await db
    .update(campaignTable)
    .set({ name: input.name })
    .where(eq(campaignTable.id, current.campaign.id));

  return {
    ...current,
    campaign: {
      ...current.campaign,
      name: input.name,
    },
  };
}

export async function updateTicketItemsForDb(
  db: DB,
  input: UpdateTicketItemsInput,
): Promise<CurrentEvent> {
  const current = await requireCurrentEvent(db);

  await db
    .update(campaignTable)
    .set({ ticketItemNames: input.names })
    .where(eq(campaignTable.id, current.campaign.id));

  return {
    ...current,
    campaign: {
      ...current.campaign,
      ticketItemNames: input.names,
    },
  };
}

export async function replaceEventForDb(
  db: DB,
  input: CreateEventInput,
): Promise<CurrentEvent> {
  await wipeAllEventData(db);
  return await createEventForDb(db, input);
}

export async function updateLotterySettingsForDb(
  db: DB,
  input: UpdateLotterySettingsInput,
): Promise<CurrentEvent> {
  const current = await requireCurrentEvent(db);

  if (input.enabled) {
    await db
      .update(lotteryTable)
      .set({ enabled: false })
      .where(ne(lotteryTable.id, current.lottery.id));
  }

  await db
    .update(lotteryTable)
    .set({
      enabled: input.enabled,
      noWinWeight: input.noWinWeight,
      winCooldownMinutes: input.winCooldownMinutes,
      printLoserTicket: input.printLoserTicket,
    })
    .where(eq(lotteryTable.id, current.lottery.id));

  return {
    ...current,
    lottery: {
      ...current.lottery,
      enabled: input.enabled,
      noWinWeight: input.noWinWeight,
      winCooldownMinutes: input.winCooldownMinutes,
      printLoserTicket: input.printLoserTicket,
    },
  };
}

export async function createPrizeForDb(
  db: DB,
  input: CreatePrizeInput,
): Promise<CurrentEvent> {
  const current = await requireCurrentEvent(db);

  await db.insert(prizeTable).values({
    lotteryId: current.lottery.id,
    title: input.title,
    winInstruction: input.winInstruction,
    weight: input.weight,
    totalQuantity: input.totalQuantity,
    remainingQuantity: input.remainingQuantity,
    rarity: input.rarity,
  });

  const next = await getCurrentEventForDb(db);
  if (!next) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to load event after creating prize.",
    });
  }
  return next;
}

export async function updatePrizeForDb(
  db: DB,
  input: UpdatePrizeInput,
): Promise<CurrentEvent> {
  const current = await requireCurrentEvent(db);
  const prize = current.prizes.find((entry) => entry.id === input.prizeId);
  if (!prize) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Prize not found on the current event.",
    });
  }

  await db
    .update(prizeTable)
    .set({
      title: input.title,
      winInstruction: input.winInstruction,
      weight: input.weight,
      totalQuantity: input.totalQuantity,
      remainingQuantity: input.remainingQuantity,
      rarity: input.rarity,
    })
    .where(
      and(
        eq(prizeTable.id, input.prizeId),
        eq(prizeTable.lotteryId, current.lottery.id),
      ),
    );

  const next = await getCurrentEventForDb(db);
  if (!next) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to load event after updating prize.",
    });
  }
  return next;
}

export async function deletePrizeForDb(
  db: DB,
  prizeId: string,
): Promise<CurrentEvent> {
  const current = await requireCurrentEvent(db);
  const prize = current.prizes.find((entry) => entry.id === prizeId);
  if (!prize) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Prize not found on the current event.",
    });
  }

  const referencedDraw = await db.query.drawTable.findFirst({
    where: eq(drawTable.prizeId, prizeId),
  });

  if (referencedDraw) {
    // Draws point at the prize row, so a won prize stays stored and leaves the active pool.
    await db
      .update(prizeTable)
      .set({
        removed: true,
        remainingQuantity: 0,
      })
      .where(
        and(
          eq(prizeTable.id, prizeId),
          eq(prizeTable.lotteryId, current.lottery.id),
        ),
      );
  } else {
    await db
      .delete(prizeTable)
      .where(
        and(
          eq(prizeTable.id, prizeId),
          eq(prizeTable.lotteryId, current.lottery.id),
        ),
      );
  }

  const next = await getCurrentEventForDb(db);
  if (!next) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to load event after deleting prize.",
    });
  }
  return next;
}

export async function restockPrizeForDb(
  db: DB,
  input: RestockPrizeInput,
): Promise<CurrentEvent> {
  const current = await requireCurrentEvent(db);
  const prize = current.prizes.find((entry) => entry.id === input.prizeId);
  if (!prize) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Prize not found on the current event.",
    });
  }

  const totalQuantity =
    input.totalQuantity ??
    Math.max(prize.totalQuantity, input.remainingQuantity);

  if (input.remainingQuantity > totalQuantity) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "remainingQuantity must be <= totalQuantity",
    });
  }

  await db
    .update(prizeTable)
    .set({
      remainingQuantity: input.remainingQuantity,
      totalQuantity,
    })
    .where(
      and(
        eq(prizeTable.id, input.prizeId),
        eq(prizeTable.lotteryId, current.lottery.id),
      ),
    );

  const next = await getCurrentEventForDb(db);
  if (!next) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to load event after restocking prize.",
    });
  }
  return next;
}

export async function listDrawsForDb(
  db: DB,
  input: ListDrawsInput,
): Promise<ListDrawsResult> {
  const current = await getCurrentEventForDb(db);
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

  const rows = parsedTicketRef
    ? await db.query.drawTable.findMany({
        where: and(
          eq(drawTable.lotteryId, current.lottery.id),
          eq(drawTable.ticketRef, parsedTicketRef),
        ),
        orderBy: [desc(drawTable.createdAt)],
        limit: input.limit,
      })
    : await db.query.drawTable.findMany({
        where: eq(drawTable.lotteryId, current.lottery.id),
        orderBy: [desc(drawTable.createdAt)],
        limit: input.limit,
      });

  const prizeIds = [
    ...new Set(rows.flatMap((row) => (row.prizeId ? [row.prizeId] : []))),
  ];
  const prizes =
    prizeIds.length === 0
      ? []
      : await db.query.prizeTable.findMany({
          where: inArray(prizeTable.id, prizeIds),
          columns: { id: true, title: true },
        });
  const prizeTitleById = new Map(
    prizes.map((prize) => [prize.id, prize.title]),
  );

  return {
    draws: rows.map((row) => ({
      id: row.id,
      ticketRef: row.ticketRef,
      createdAt: row.createdAt.toISOString(),
      outcome: row.prizeId ? "win" : "loss",
      prizeTitle: row.prizeId
        ? (prizeTitleById.get(row.prizeId) ?? null)
        : null,
    })),
  };
}
