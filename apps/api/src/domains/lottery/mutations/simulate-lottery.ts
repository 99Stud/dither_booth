import { db } from "#db/index.ts";
import { publicProcedure } from "#internal/trpc.ts";

import {
  LOTTERY_CONFIG_SINGLETON_ID,
  SIMULATE_LOTTERY_SCHEMA,
} from "../internal/lottery.constants";
import { runMonteCarloLotterySimulation } from "../internal/lottery.monte-carlo";
import { lotteryConfigTable, lotteryLotTable } from "../internal/lottery.schema";

export const simulateLottery = publicProcedure
  .input(SIMULATE_LOTTERY_SCHEMA)
  .mutation(async ({ input }) => {
    const existingConfig = await db.query.lotteryConfigTable.findFirst();
    const baseConfig =
      existingConfig ??
      (
        await db
          .insert(lotteryConfigTable)
          .values({ id: LOTTERY_CONFIG_SINGLETON_ID })
          .returning()
      )[0]!;

    // Simulation always runs the full engine regardless of the admin toggle.
    const config = { ...baseConfig, enabled: true };

    const lots = await db
      .select()
      .from(lotteryLotTable);

    return runMonteCarloLotterySimulation({
      attempts: input.attempts,
      samples: input.samples,
      profile: input.profile,
      config,
      lots,
    });
  });
