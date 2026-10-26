import { updatePrizeInputSchema } from "../internal/event.constants";
import { lotteryConfigProcedure } from "../internal/event.kiosk";
import { updatePrizeForDb } from "../internal/event.service";

export const updatePrize = lotteryConfigProcedure
  .input(updatePrizeInputSchema)
  .mutation(async ({ ctx, input }) => {
    return await updatePrizeForDb(ctx.db, input);
  });
