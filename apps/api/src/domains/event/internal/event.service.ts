import { createId } from "@paralleldrive/cuid2";
import { TRPCError } from "@trpc/server";
import { and, eq, ne } from "drizzle-orm";

import type { DB } from "#db/internal/db.types";
import {
  campaignTable,
  drawTable,
  lotteryTable,
  prizeTable,
} from "#db/internal/db.schema";

import type {
  CreateEventInput,
  CreateLotInput,
  RestockLotInput,
  UpdateEventInput,
  UpdateLotInput,
  UpdateLotterySettingsInput,
} from "./event.constants";
import type { CurrentEvent, EventLot } from "./event.types";

function mapLot(prize: {
  id: string;
  winDescription: string;
  weight: number;
  totalQuantity: number;
  remainingQuantity: number;
  rarity: EventLot["rarity"];
}): EventLot {
  return {
    id: prize.id,
    winDescription: prize.winDescription,
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
    where: eq(prizeTable.lotteryId, lottery.id),
  });

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
    },
    lottery: {
      id: lottery.id,
      enabled: lottery.enabled,
      noWinWeight: lottery.noWinWeight,
      winCooldownMinutes: lottery.winCooldownMinutes,
    },
    lots: prizes.map(mapLot),
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
    })
    .where(eq(lotteryTable.id, current.lottery.id));

  return {
    ...current,
    lottery: {
      ...current.lottery,
      enabled: input.enabled,
      noWinWeight: input.noWinWeight,
      winCooldownMinutes: input.winCooldownMinutes,
    },
  };
}

export async function createLotForDb(
  db: DB,
  input: CreateLotInput,
): Promise<CurrentEvent> {
  const current = await requireCurrentEvent(db);

  await db.insert(prizeTable).values({
    lotteryId: current.lottery.id,
    winDescription: input.winDescription,
    weight: input.weight,
    totalQuantity: input.totalQuantity,
    remainingQuantity: input.remainingQuantity,
    rarity: input.rarity,
  });

  const next = await getCurrentEventForDb(db);
  if (!next) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to load event after creating lot.",
    });
  }
  return next;
}

export async function updateLotForDb(
  db: DB,
  input: UpdateLotInput,
): Promise<CurrentEvent> {
  const current = await requireCurrentEvent(db);
  const lot = current.lots.find((entry) => entry.id === input.lotId);
  if (!lot) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Lot not found on the current event.",
    });
  }

  await db
    .update(prizeTable)
    .set({
      winDescription: input.winDescription,
      weight: input.weight,
      totalQuantity: input.totalQuantity,
      remainingQuantity: input.remainingQuantity,
      rarity: input.rarity,
    })
    .where(
      and(
        eq(prizeTable.id, input.lotId),
        eq(prizeTable.lotteryId, current.lottery.id),
      ),
    );

  const next = await getCurrentEventForDb(db);
  if (!next) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to load event after updating lot.",
    });
  }
  return next;
}

export async function deleteLotForDb(
  db: DB,
  lotId: string,
): Promise<CurrentEvent> {
  const current = await requireCurrentEvent(db);
  const lot = current.lots.find((entry) => entry.id === lotId);
  if (!lot) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Lot not found on the current event.",
    });
  }

  const referencedDraw = await db.query.drawTable.findFirst({
    where: eq(drawTable.prizeId, lotId),
  });
  if (referencedDraw) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "This lot has draw history and cannot be deleted. Restock or replace the event instead.",
    });
  }

  await db
    .delete(prizeTable)
    .where(
      and(
        eq(prizeTable.id, lotId),
        eq(prizeTable.lotteryId, current.lottery.id),
      ),
    );

  const next = await getCurrentEventForDb(db);
  if (!next) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to load event after deleting lot.",
    });
  }
  return next;
}

export async function restockLotForDb(
  db: DB,
  input: RestockLotInput,
): Promise<CurrentEvent> {
  const current = await requireCurrentEvent(db);
  const lot = current.lots.find((entry) => entry.id === input.lotId);
  if (!lot) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Lot not found on the current event.",
    });
  }

  const totalQuantity =
    input.totalQuantity ??
    Math.max(lot.totalQuantity, input.remainingQuantity);

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
        eq(prizeTable.id, input.lotId),
        eq(prizeTable.lotteryId, current.lottery.id),
      ),
    );

  const next = await getCurrentEventForDb(db);
  if (!next) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to load event after restocking lot.",
    });
  }
  return next;
}
