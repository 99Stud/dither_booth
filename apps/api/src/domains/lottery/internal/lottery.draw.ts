import { logKioskEvent } from "@dither-booth/logging";
import { and, desc, eq, gt, isNotNull, sql } from "drizzle-orm";

import type { DB } from "#db/internal/db.types";
import { drawTable, lotteryTable, prizeTable } from "#db/internal/db.schema";

import { LOTTERY_LOG_SOURCE } from "./lottery.constants";
import {
  isLotteryOpen,
  isWithinWinCooldown,
  runLotteryDraw,
} from "./lottery.engine";
import type { DrawResult } from "./lottery.types";

export async function executeLotteryDraw(params: {
  db: DB;
}): Promise<DrawResult> {
  const { db } = params;

  const lottery = await db.query.lotteryTable.findFirst({
    where: eq(lotteryTable.enabled, true),
  });

  const recordLoss = async (): Promise<DrawResult> => {
    await db
      .insert(drawTable)
      .values({ lotteryId: lottery?.id ?? null, prizeId: null });

    return { outcome: "loss", prize: null };
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
      tx.insert(drawTable)
        .values({ lotteryId: lottery.id, prizeId: null })
        .run();

      return false;
    }

    tx.insert(drawTable)
      .values({ lotteryId: lottery.id, prizeId: wonPrizeId })
      .run();

    return true;
  });

  if (!committed) {
    return { outcome: "loss", prize: null };
  }

  logKioskEvent("info", LOTTERY_LOG_SOURCE, "lottery-draw-win", {
    details: {
      lotteryId: lottery.id,
      prizeId: wonPrizeId,
      rarity: drawResult.prize.rarity,
    },
  });

  return drawResult;
}
