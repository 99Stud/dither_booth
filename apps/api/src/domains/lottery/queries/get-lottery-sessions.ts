import { db } from "#db/index.ts";
import { publicProcedure } from "#internal/trpc.ts";
import {
  lotteryEventTable,
  lotterySessionTable,
} from "#domains/lottery/internal/lottery.schema.ts";
import { count, desc } from "drizzle-orm";

export const getLotterySessions = publicProcedure.query(async () => {
  const sessions = await db
    .select()
    .from(lotterySessionTable)
    .orderBy(desc(lotterySessionTable.id))
    .all();

  const countRows = await db
    .select({
      sessionId: lotteryEventTable.sessionId,
      n: count(lotteryEventTable.id),
    })
    .from(lotteryEventTable)
    .groupBy(lotteryEventTable.sessionId)
    .all();

  const trialMap = new Map(
    countRows
      .filter((r) => r.sessionId != null)
      .map((r) => [r.sessionId!, r.n]),
  );

  return sessions.map((s) => ({
    ...s,
    trialCount: trialMap.get(s.id) ?? 0,
    isEnded: s.endedAt != null,
  }));
});
