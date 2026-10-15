import type { DrawResult } from "@dither-booth/shared/lottery";

import { logKioskEvent } from "@dither-booth/logging";
import { and, desc, eq, isNotNull } from "drizzle-orm";

import type { DB, DbTransaction } from "#db/internal/db.types";

import { drawTable, lotteryTable, prizeTable } from "#db/internal/db.schema";
import {
  getLotteryForceConfig,
  type LotteryForceConfig,
} from "#lib/runtime-flags/runtime-flags";

import { LOTTERY_LOG_SOURCE } from "./lottery.constants";
import { isWithinWinCooldown, runLotteryDraw } from "./lottery.engine";
import {
  getPrizeStock,
  hasRemainingStock,
  prizeStockColumns,
} from "./lottery.stock";
import {
  createBoothTicketRef,
  isUniqueTicketRefConstraintError,
  TICKET_REF_ALLOCATION_ATTEMPTS,
} from "./lottery.ticket-ref";

export type LotteryDrawExecution = {
  result: DrawResult;
  ticketRef: string;
  /** `printLoserTicket` of the lottery this draw was recorded against. */
  printLoserTicket: boolean;
};

type CommittedDraw = LotteryDrawExecution & {
  lotteryId: string | null;
  logEvent:
    | "lottery-draw-win"
    | "lottery-draw-force-win"
    | "lottery-draw-force-loss"
    | null;
};

function insertDraw(
  tx: DbTransaction,
  params: {
    lotteryId: string | null;
    prize: { id: string; title: string } | null;
    ticketRef?: string;
  },
): string {
  let ticketRef = params.ticketRef ?? createBoothTicketRef();

  for (let attempt = 0; attempt < TICKET_REF_ALLOCATION_ATTEMPTS; attempt++) {
    try {
      tx.insert(drawTable)
        .values({
          lotteryId: params.lotteryId,
          prizeId: params.prize?.id ?? null,
          prizeTitle: params.prize?.title ?? null,
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

function getEnabledLottery(tx: DbTransaction) {
  return tx
    .select()
    .from(lotteryTable)
    .where(eq(lotteryTable.enabled, true))
    .get();
}

function recordLoss(
  tx: DbTransaction,
  params: {
    lottery: { id: string; printLoserTicket: boolean } | undefined;
    ticketRef?: string;
    logEvent: CommittedDraw["logEvent"];
  },
): CommittedDraw {
  const lotteryId = params.lottery?.id ?? null;
  const ticketRef = insertDraw(tx, {
    lotteryId,
    prize: null,
    ticketRef: params.ticketRef,
  });

  return {
    result: { outcome: "loss", prize: null },
    ticketRef,
    printLoserTicket: params.lottery?.printLoserTicket ?? false,
    lotteryId,
    logEvent: params.logEvent,
  };
}

function runForcedWin(
  tx: DbTransaction,
  params: { prizeId: string; ticketRef?: string },
): CommittedDraw {
  const prize = tx
    .select()
    .from(prizeTable)
    .where(eq(prizeTable.id, params.prizeId))
    .get();

  if (!prize || prize.removed) {
    throw new Error(`Forced lottery prize not found: ${params.prizeId}`);
  }

  // Forcing skips the odds, the cooldown and `enabled`, never the stock: the
  // win row inserted below is what takes the unit.
  if ((getPrizeStock(tx, prize.id)?.remainingQuantity ?? 0) <= 0) {
    throw new Error(`Forced lottery prize is out of stock: ${params.prizeId}`);
  }

  const lottery = tx
    .select({ printLoserTicket: lotteryTable.printLoserTicket })
    .from(lotteryTable)
    .where(eq(lotteryTable.id, prize.lotteryId))
    .get();

  const ticketRef = insertDraw(tx, {
    lotteryId: prize.lotteryId,
    prize,
    ticketRef: params.ticketRef,
  });

  return {
    result: {
      outcome: "win",
      prize: {
        id: prize.id,
        rarity: prize.rarity,
        title: prize.title,
        winInstruction: prize.winInstruction,
      },
    },
    ticketRef,
    printLoserTicket: lottery?.printLoserTicket ?? false,
    lotteryId: prize.lotteryId,
    logEvent: "lottery-draw-force-win",
  };
}

function runWeightedDraw(
  tx: DbTransaction,
  params: { now: Date; random?: () => number; ticketRef?: string },
): CommittedDraw {
  const lottery = getEnabledLottery(tx);

  if (!lottery) {
    return recordLoss(tx, {
      lottery,
      ticketRef: params.ticketRef,
      logEvent: null,
    });
  }

  const lastWin = tx
    .select({ createdAt: drawTable.createdAt })
    .from(drawTable)
    .where(
      and(eq(drawTable.lotteryId, lottery.id), isNotNull(drawTable.prizeId)),
    )
    .orderBy(desc(drawTable.createdAt))
    .limit(1)
    .get();

  const withinCooldown = isWithinWinCooldown({
    lastWinAt: lastWin?.createdAt ?? null,
    now: params.now,
    winCooldownMinutes: lottery.winCooldownMinutes,
  });

  if (withinCooldown) {
    return recordLoss(tx, {
      lottery,
      ticketRef: params.ticketRef,
      logEvent: null,
    });
  }

  const eligiblePrizes = tx
    .select({
      id: prizeTable.id,
      rarity: prizeTable.rarity,
      title: prizeTable.title,
      weight: prizeTable.weight,
      winInstruction: prizeTable.winInstruction,
      ...prizeStockColumns,
    })
    .from(prizeTable)
    .where(
      and(
        eq(prizeTable.lotteryId, lottery.id),
        eq(prizeTable.removed, false),
        hasRemainingStock,
      ),
    )
    .all();

  const drawResult = runLotteryDraw({
    noWinWeight: lottery.noWinWeight,
    prizes: eligiblePrizes,
    random: params.random,
  });

  // Eligible prizes all have stock, and the whole draw is one synchronous
  // transaction, so the win row below always finds its unit.
  if (drawResult.outcome === "loss") {
    return recordLoss(tx, {
      lottery,
      ticketRef: params.ticketRef,
      logEvent: null,
    });
  }

  const ticketRef = insertDraw(tx, {
    lotteryId: lottery.id,
    prize: drawResult.prize,
    ticketRef: params.ticketRef,
  });

  return {
    result: drawResult,
    ticketRef,
    printLoserTicket: lottery.printLoserTicket,
    lotteryId: lottery.id,
    logEvent: "lottery-draw-win",
  };
}

/**
 * Records one draw. Everything from the cooldown read to the draw insert runs
 * in a single synchronous transaction, so concurrent visits cannot both win
 * inside one cooldown window or take the same last unit of stock.
 */
export async function executeLotteryDraw(params: {
  db: DB;
  force?: LotteryForceConfig | null;
  now?: Date;
  random?: () => number;
  ticketRef?: string;
}): Promise<LotteryDrawExecution> {
  const { db, ticketRef } = params;
  const force =
    params.force === undefined ? getLotteryForceConfig() : params.force;
  const now = params.now ?? new Date();

  const committed = db.transaction((tx): CommittedDraw => {
    if (force?.outcome === "loss") {
      return recordLoss(tx, {
        lottery: getEnabledLottery(tx),
        ticketRef,
        logEvent: "lottery-draw-force-loss",
      });
    }

    if (force?.outcome === "win") {
      return runForcedWin(tx, { prizeId: force.prizeId, ticketRef });
    }

    return runWeightedDraw(tx, { now, random: params.random, ticketRef });
  });

  if (committed.logEvent) {
    logKioskEvent("info", LOTTERY_LOG_SOURCE, committed.logEvent, {
      details: {
        lotteryId: committed.lotteryId,
        ...(committed.result.outcome === "win"
          ? {
              prizeId: committed.result.prize.id,
              rarity: committed.result.prize.rarity,
            }
          : {}),
        ticketRef: committed.ticketRef,
      },
    });
  }

  return {
    result: committed.result,
    ticketRef: committed.ticketRef,
    printLoserTicket: committed.printLoserTicket,
  };
}
