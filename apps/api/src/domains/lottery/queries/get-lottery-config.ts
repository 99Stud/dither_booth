import { db } from "#db/index.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { lotteryConfigTable } from "#domains/lottery/internal/lottery.schema.ts";

export const getLotteryConfig = publicProcedure.query(async () => {
  const config = await db.query.lotteryConfigTable.findFirst();
  if (config) return config;

  const [row] = await db.insert(lotteryConfigTable).values({}).returning();
  return row!;
});
