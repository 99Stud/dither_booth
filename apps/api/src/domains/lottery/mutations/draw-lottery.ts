import { TRPCError } from "@trpc/server";

import { publicProcedure } from "#internal/trpc";

import type { DrawResult } from "../internal/lottery.types";

import { executeLotteryDraw } from "../internal/lottery.draw";

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
