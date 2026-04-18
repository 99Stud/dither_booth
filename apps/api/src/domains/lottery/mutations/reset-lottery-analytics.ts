import { db } from "#db/index.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { lotteryEventTable } from "#domains/lottery/internal/lottery.schema.ts";

export const resetLotteryAnalytics = publicProcedure.mutation(async () => {
  await db.delete(lotteryEventTable);
  return { success: true as const };
});
