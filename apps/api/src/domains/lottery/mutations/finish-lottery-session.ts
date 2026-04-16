import { db, sqlite } from "#db/index.ts";
import { publicProcedure } from "#internal/trpc.ts";
import {
  FINISH_LOTTERY_SESSION_SCHEMA,
  LOTTERY_CONFIG_SINGLETON_ID,
} from "#domains/lottery/internal/lottery.constants.ts";
import {
  lotteryConfigTable,
  lotteryLotTable,
  lotterySessionTable,
} from "#domains/lottery/internal/lottery.schema.ts";
import { eq, sql } from "drizzle-orm";

const DEFAULT_BASE_WIN_PRESSURE = 0.15;
const DEFAULT_MAX_BOOST = 3;

export const finishLotterySession = publicProcedure
  .input(FINISH_LOTTERY_SESSION_SCHEMA.optional())
  .mutation(async ({ input }) => {
    const resetStock = input?.resetStock ?? true;
    const resetProbabilities = input?.resetProbabilities ?? false;
    const now = new Date().toISOString();
    const existing = await db.query.lotteryConfigTable.findFirst();

    if (!existing?.sessionActive || existing.currentSessionId == null) {
      if (!existing) {
        return (
          await db.insert(lotteryConfigTable).values({}).returning()
        )[0]!;
      }
      return existing;
    }

    const sessionId = existing.currentSessionId;

    sqlite.transaction(() => {
      db.update(lotterySessionTable)
        .set({ endedAt: now })
        .where(eq(lotterySessionTable.id, sessionId))
        .run();

      if (resetStock) {
        db.update(lotteryLotTable)
          .set({
            stockRemaining: sql`${lotteryLotTable.stockTotal}`,
          })
          .run();
      }

      const nextConfig: Record<string, unknown> = {
        currentSessionId: null,
        sessionActive: false,
        lastSessionEndedAt: now,
      };

      if (resetProbabilities) {
        nextConfig.baseWinPressure = DEFAULT_BASE_WIN_PRESSURE;
        nextConfig.maxBoost = DEFAULT_MAX_BOOST;
      }

      db.update(lotteryConfigTable)
        .set(nextConfig as typeof lotteryConfigTable.$inferInsert)
        .where(eq(lotteryConfigTable.id, LOTTERY_CONFIG_SINGLETON_ID))
        .run();
    })();

    const [row] = await db
      .select()
      .from(lotteryConfigTable)
      .where(eq(lotteryConfigTable.id, LOTTERY_CONFIG_SINGLETON_ID))
      .limit(1);

    return row!;
  });
