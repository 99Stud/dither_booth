import { db, sqlite } from "#db/index.ts";
import { publicProcedure } from "#internal/trpc.ts";
import {
  lotteryConfigTable,
  lotteryEventTable,
  lotteryLotTable,
} from "#domains/lottery/internal/lottery.schema.ts";
import { executeDraw } from "#domains/lottery/internal/lottery.engine.ts";
import { LOTTERY_OUTCOME } from "#domains/lottery/internal/lottery.constants.ts";
import { asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { API_LOTTERY_LOG_SOURCE } from "#domains/lottery/internal/lottery.constants.ts";
import { logKioskEvent } from "@dither-booth/logging";

export const lotteryDraw = publicProcedure
  .input(
    z
      .object({
        captureToDrawMs: z.number().int().optional(),
        clientFlowId: z.string().uuid().optional(),
      })
      .optional(),
  )
  .mutation(async ({ input }) => {
    const drawStartedAt = performance.now();
    const now = new Date();

    const config = await db.query.lotteryConfigTable.findFirst();

    const result = await (async () => {
      if (!config) {
        const [created] = await db
          .insert(lotteryConfigTable)
          .values({})
          .returning();
        return performDraw(now, created!, input?.captureToDrawMs);
      }
      return performDraw(now, config, input?.captureToDrawMs);
    })();

    logKioskEvent("info", API_LOTTERY_LOG_SOURCE, "lottery-draw-metrics", {
      details: {
        totalMs: Math.round((performance.now() - drawStartedAt) * 100) / 100,
        ...(input?.clientFlowId ? { clientFlowId: input.clientFlowId } : {}),
        outcome: result.outcome,
        eventId: result.eventId,
      },
    });

    return result;
  });

async function loadRecentEventsForSession(sessionId: number) {
  const rows = await db
    .select()
    .from(lotteryEventTable)
    .where(eq(lotteryEventTable.sessionId, sessionId))
    .orderBy(desc(lotteryEventTable.id))
    .limit(400)
    .all();

  return rows.reverse();
}

async function performDraw(
  now: Date,
  config: NonNullable<Awaited<ReturnType<typeof db.query.lotteryConfigTable.findFirst>>>,
  captureToDrawMs?: number,
) {
  const sessionId = config.currentSessionId;
  if (
    !config.enabled ||
    !config.sessionActive ||
    sessionId == null
  ) {
    return {
      outcome: "loss" as const,
      lotId: null,
      lotLabel: null,
      lotRarity: null,
      eventId: null,
    };
  }

  const lots = await db.select().from(lotteryLotTable).orderBy(asc(lotteryLotTable.sortOrder));
  const recentEvents = await loadRecentEventsForSession(sessionId);

  const result = executeDraw({ now, config, lots, recentEvents });

  const transactionResult = sqlite.transaction(() => {
    if (result.outcome === LOTTERY_OUTCOME.WIN && result.lotId !== null) {
      const updated = db
        .update(lotteryLotTable)
        .set({
          stockRemaining: sql`${lotteryLotTable.stockRemaining} - 1`,
        })
        .where(eq(lotteryLotTable.id, result.lotId))
        .returning()
        .all();

      if (updated.length === 0 || updated[0]!.stockRemaining < 0) {
        const [event] = db
          .insert(lotteryEventTable)
          .values({
            sessionId,
            timestamp: now.toISOString(),
            outcome: LOTTERY_OUTCOME.LOSS,
            lotId: null,
            abuseDetected: result.abuseDetected,
            computedPressure: result.computedPressure,
            computedWinProbability: result.computedWinProbability,
            remainingStock: result.remainingStock,
            elapsedWindowRatio: result.elapsedWindowRatio,
            captureToDrawMs: captureToDrawMs ?? null,
          })
          .returning()
          .all();

        return {
          outcome: "loss" as const,
          lotId: null,
          lotLabel: null,
          lotRarity: null,
          eventId: event!.id,
        };
      }
    }

    const [event] = db
      .insert(lotteryEventTable)
      .values({
        sessionId,
        timestamp: now.toISOString(),
        outcome: result.outcome,
        lotId: result.lotId,
        abuseDetected: result.abuseDetected,
        computedPressure: result.computedPressure,
        computedWinProbability: result.computedWinProbability,
        remainingStock: result.remainingStock,
        elapsedWindowRatio: result.elapsedWindowRatio,
        captureToDrawMs: captureToDrawMs ?? null,
      })
      .returning()
      .all();

    const wonLot =
      result.outcome === LOTTERY_OUTCOME.WIN && result.lotId !== null
        ? lots.find((l) => l.id === result.lotId)
        : null;

    return {
      outcome: result.outcome,
      lotId: result.lotId,
      lotLabel: wonLot?.label ?? null,
      lotRarity: wonLot?.rarity ?? null,
      eventId: event!.id,
    };
  })();

  return transactionResult;
}
