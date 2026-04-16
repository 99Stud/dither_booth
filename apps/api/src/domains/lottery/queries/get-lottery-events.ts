import { db } from "#db/index.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { GET_LOTTERY_EVENTS_SCHEMA } from "#domains/lottery/internal/lottery.constants.ts";
import {
  lotteryEventTable,
  lotteryLotTable,
} from "#domains/lottery/internal/lottery.schema.ts";
import { desc, eq } from "drizzle-orm";

export const getLotteryEvents = publicProcedure
  .input(GET_LOTTERY_EVENTS_SCHEMA)
  .query(async ({ input }) => {
    if (input.sessionId != null) {
      return await db
        .select({
          id: lotteryEventTable.id,
          timestamp: lotteryEventTable.timestamp,
          sessionId: lotteryEventTable.sessionId,
          outcome: lotteryEventTable.outcome,
          lotId: lotteryEventTable.lotId,
          lotLabel: lotteryLotTable.label,
          lotRarity: lotteryLotTable.rarity,
          abuseDetected: lotteryEventTable.abuseDetected,
          computedWinProbability: lotteryEventTable.computedWinProbability,
          captureToDrawMs: lotteryEventTable.captureToDrawMs,
        })
        .from(lotteryEventTable)
        .leftJoin(lotteryLotTable, eq(lotteryEventTable.lotId, lotteryLotTable.id))
        .where(eq(lotteryEventTable.sessionId, input.sessionId))
        .orderBy(desc(lotteryEventTable.id))
        .limit(input.limit)
        .all();
    }

    return await db
      .select({
        id: lotteryEventTable.id,
        timestamp: lotteryEventTable.timestamp,
        sessionId: lotteryEventTable.sessionId,
        outcome: lotteryEventTable.outcome,
        lotId: lotteryEventTable.lotId,
        lotLabel: lotteryLotTable.label,
        lotRarity: lotteryLotTable.rarity,
        abuseDetected: lotteryEventTable.abuseDetected,
        computedWinProbability: lotteryEventTable.computedWinProbability,
        captureToDrawMs: lotteryEventTable.captureToDrawMs,
      })
      .from(lotteryEventTable)
      .leftJoin(lotteryLotTable, eq(lotteryEventTable.lotId, lotteryLotTable.id))
      .orderBy(desc(lotteryEventTable.id))
      .limit(input.limit)
      .all();
  });
