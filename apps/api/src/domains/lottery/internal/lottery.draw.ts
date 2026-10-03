import { logKioskEvent } from "@dither-booth/logging";
import { and, desc, eq, gt, isNotNull, sql } from "drizzle-orm";

import type { DB } from "#db/internal/db.types";

import { drawTable, lotteryTable, prizeTable } from "#db/internal/db.schema";
import {
  getLotteryForceConfig,
  type LotteryForceConfig,
} from "#lib/runtime-flags/runtime-flags";

import type { DrawResult } from "./lottery.types";

import { LOTTERY_LOG_SOURCE } from "./lottery.constants";
import {
  isLotteryOpen,
  isWithinWinCooldown,
  runLotteryDraw,
} from "./lottery.engine";
import {
  createBoothTicketRef,
  isUniqueTicketRefConstraintError,
  TICKET_REF_ALLOCATION_ATTEMPTS,
} from "./lottery.ticket-ref";

export type LotteryDrawExecution = {
  result: DrawResult;
  ticketRef: string;
};

async function insertDraw(params: {
  db: DB;
  lotteryId: string | null;
  prizeId: string | null;
  ticketRef?: string;
}): Promise<string> {
  let ticketRef = params.ticketRef ?? createBoothTicketRef();

  for (let attempt = 0; attempt < TICKET_REF_ALLOCATION_ATTEMPTS; attempt++) {
    try {
      await params.db.insert(drawTable).values({
        lotteryId: params.lotteryId,
        prizeId: params.prizeId,
        ticketRef,
      });
      return ticketRef;
    } catch (error) {
      if (
        !isUniqueTicketRefConstraintError(error) ||
        attempt === TICKET_REF_ALLOCATION_ATTEMPTS - 1
      ) {
        throw error;
      }
      ticketRef = createBoothTicketRef();
    }
  }

  throw new Error("Failed to allocate a unique ticket number.");
}

function insertDrawInTransaction(params: {
  tx: Parameters<Parameters<DB["transaction"]>[0]>[0];
  lotteryId: string;
  prizeId: string | null;
  ticketRef?: string;
}): string {
  let ticketRef = params.ticketRef ?? createBoothTicketRef();

  for (let attempt = 0; attempt < TICKET_REF_ALLOCATION_ATTEMPTS; attempt++) {
    try {
      params.tx
        .insert(drawTable)
        .values({
          lotteryId: params.lotteryId,
          prizeId: params.prizeId,
          ticketRef,
        })
        .run();
      return ticketRef;
    } catch (error) {
      if (
        !isUniqueTicketRefConstraintError(error) ||
        attempt === TICKET_REF_ALLOCATION_ATTEMPTS - 1
      ) {
        throw error;
      }
      ticketRef = createBoothTicketRef();
    }
  }

  throw new Error("Failed to allocate a unique ticket number.");
}

export async function executeLotteryDraw(params: {
  db: DB;
  force?: LotteryForceConfig | null;
  ticketRef?: string;
}): Promise<LotteryDrawExecution> {
  const { db } = params;
  const preferredTicketRef = params.ticketRef;
  const force =
    params.force === undefined ? getLotteryForceConfig() : params.force;

  if (force?.outcome === "loss") {
    const lottery = await db.query.lotteryTable.findFirst({
      where: eq(lotteryTable.enabled, true),
    });

    const ticketRef = await insertDraw({
      db,
      lotteryId: lottery?.id ?? null,
      prizeId: null,
      ticketRef: preferredTicketRef,
    });

    logKioskEvent("info", LOTTERY_LOG_SOURCE, "lottery-draw-force-loss", {
      details: {
        lotteryId: lottery?.id ?? null,
        ticketRef,
      },
    });

    return { result: { outcome: "loss", prize: null }, ticketRef };
  }

  if (force?.outcome === "win") {
    const prize = await db.query.prizeTable.findFirst({
      where: eq(prizeTable.id, force.prizeId),
    });

    if (!prize || prize.removed) {
      throw new Error(`Forced lottery prize not found: ${force.prizeId}`);
    }

    const ticketRef = await insertDraw({
      db,
      lotteryId: prize.lotteryId,
      prizeId: prize.id,
      ticketRef: preferredTicketRef,
    });

    logKioskEvent("info", LOTTERY_LOG_SOURCE, "lottery-draw-force-win", {
      details: {
        lotteryId: prize.lotteryId,
        prizeId: prize.id,
        rarity: prize.rarity,
        ticketRef,
      },
    });

    return {
      ticketRef,
      result: {
        outcome: "win",
        prize: {
          id: prize.id,
          rarity: prize.rarity,
          title: prize.title,
          winInstruction: prize.winInstruction,
        },
      },
    };
  }

  const lottery = await db.query.lotteryTable.findFirst({
    where: eq(lotteryTable.enabled, true),
  });

  const recordLoss = async (): Promise<LotteryDrawExecution> => {
    const ticketRef = await insertDraw({
      db,
      lotteryId: lottery?.id ?? null,
      prizeId: null,
      ticketRef: preferredTicketRef,
    });

    return { result: { outcome: "loss", prize: null }, ticketRef };
  };

  if (!lottery || !isLotteryOpen(lottery)) {
    return await recordLoss();
  }

  const lastWin = await db.query.drawTable.findFirst({
    where: and(
      eq(drawTable.lotteryId, lottery.id),
      isNotNull(drawTable.prizeId),
    ),
    orderBy: [desc(drawTable.createdAt)],
  });

  const withinCooldown = isWithinWinCooldown({
    lastWinAt: lastWin?.createdAt ?? null,
    now: new Date(),
    winCooldownMinutes: lottery.winCooldownMinutes,
  });

  if (withinCooldown) {
    return await recordLoss();
  }

  const eligiblePrizes = await db.query.prizeTable.findMany({
    where: and(
      eq(prizeTable.lotteryId, lottery.id),
      eq(prizeTable.removed, false),
      gt(prizeTable.remainingQuantity, 0),
    ),
  });

  const drawResult = runLotteryDraw({
    noWinWeight: lottery.noWinWeight,
    prizes: eligiblePrizes,
  });

  if (drawResult.outcome === "loss") {
    return await recordLoss();
  }

  const wonPrizeId = drawResult.prize.id;

  // Guard the decrement against a concurrent draw depleting the last unit.
  const committed = db.transaction((tx) => {
    const decremented = tx
      .update(prizeTable)
      .set({
        remainingQuantity: sql`${prizeTable.remainingQuantity} - 1`,
      })
      .where(
        and(eq(prizeTable.id, wonPrizeId), gt(prizeTable.remainingQuantity, 0)),
      )
      .returning({ id: prizeTable.id })
      .all();

    if (decremented.length === 0) {
      const ticketRef = insertDrawInTransaction({
        tx,
        lotteryId: lottery.id,
        prizeId: null,
        ticketRef: preferredTicketRef,
      });

      return { won: false, ticketRef };
    }

    const ticketRef = insertDrawInTransaction({
      tx,
      lotteryId: lottery.id,
      prizeId: wonPrizeId,
      ticketRef: preferredTicketRef,
    });

    return { won: true, ticketRef };
  });

  if (!committed.won) {
    return {
      result: { outcome: "loss", prize: null },
      ticketRef: committed.ticketRef,
    };
  }

  logKioskEvent("info", LOTTERY_LOG_SOURCE, "lottery-draw-win", {
    details: {
      lotteryId: lottery.id,
      prizeId: wonPrizeId,
      rarity: drawResult.prize.rarity,
      ticketRef: committed.ticketRef,
    },
  });

  return { result: drawResult, ticketRef: committed.ticketRef };
}
