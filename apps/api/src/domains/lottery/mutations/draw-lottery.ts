import { TRPCError } from "@trpc/server";

import { publicProcedure } from "#internal/trpc";

import { executeLotteryDraw } from "../internal/lottery.draw";
import type { DrawResult } from "../internal/lottery.types";

export const drawLottery = publicProcedure.mutation(
  async ({ ctx }): Promise<DrawResult> => {
    try {
      return await executeLotteryDraw({ db: ctx.db });
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to execute lottery draw.",
        cause: error,
      });
    }
  },
);
