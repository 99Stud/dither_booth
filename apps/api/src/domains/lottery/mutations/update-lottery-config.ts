import { db } from "#db/index.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { CONFIGURE_LOTTERY_SCHEMA, LOTTERY_CONFIG_SINGLETON_ID } from "#domains/lottery/internal/lottery.constants.ts";
import { lotteryConfigTable } from "#domains/lottery/internal/lottery.schema.ts";
import { eq } from "drizzle-orm";

export const updateLotteryConfig = publicProcedure
  .input(CONFIGURE_LOTTERY_SCHEMA)
  .mutation(async ({ input }) => {
    const existing = await db.query.lotteryConfigTable.findFirst();

    if (!existing) {
      return db
        .insert(lotteryConfigTable)
        .values({ ...input })
        .returning()
        .then((rows) => rows[0]!);
    }

    return db
      .update(lotteryConfigTable)
      .set(input)
      .where(eq(lotteryConfigTable.id, LOTTERY_CONFIG_SINGLETON_ID))
      .returning()
      .then((rows) => rows[0]!);
  });
