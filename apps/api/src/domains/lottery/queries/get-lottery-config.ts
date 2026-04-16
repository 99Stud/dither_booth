import { db } from "#db/index.ts";
import { publicProcedure } from "#internal/trpc.ts";
import {
  lotteryConfigTable,
  lotterySessionTable,
} from "#domains/lottery/internal/lottery.schema.ts";
import { eq } from "drizzle-orm";

export const getLotteryConfig = publicProcedure.query(async () => {
  let config = await db.query.lotteryConfigTable.findFirst();
  if (!config) {
    const [row] = await db.insert(lotteryConfigTable).values({}).returning();
    config = row!;
  }

  const activeSession = config.currentSessionId
    ? await db.query.lotterySessionTable.findFirst({
        where: eq(lotterySessionTable.id, config.currentSessionId),
      })
    : null;

  return {
    ...config,
    activeSession,
  };
});
