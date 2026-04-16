import { db } from "#db/index.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { TUNE_LOTTERY_SCHEMA } from "#domains/lottery/internal/lottery.constants.ts";
import { lotteryLotTable } from "#domains/lottery/internal/lottery.schema.ts";
import { runLotteryTuneSearch } from "#domains/lottery/internal/lottery.tuning.ts";
import { TRPCError } from "@trpc/server";
import { asc } from "drizzle-orm";

export const tuneLottery = publicProcedure
  .input(TUNE_LOTTERY_SCHEMA)
  .mutation(async ({ input }) => {
    const lots = await db
      .select()
      .from(lotteryLotTable)
      .orderBy(asc(lotteryLotTable.sortOrder), asc(lotteryLotTable.id))
      .all();

    if (lots.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Add at least one prize pool before running optimization.",
      });
    }

    return runLotteryTuneSearch({
      samples: input.samples,
      attempts: input.attempts,
      seed: input.seed,
      lots,
    });
  });
