import { restockPrizeInputSchema } from "../internal/event.constants";
import { lotteryConfigProcedure } from "../internal/event.kiosk";
import { restockPrizeForDb } from "../internal/event.service";

export const restockPrize = lotteryConfigProcedure
  .input(restockPrizeInputSchema)
  .mutation(async ({ ctx, input }) => {
    return await restockPrizeForDb(ctx.db, input);
  });
