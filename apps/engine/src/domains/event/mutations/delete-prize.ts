import { deletePrizeInputSchema } from "../internal/event.constants";
import { lotteryConfigProcedure } from "../internal/event.kiosk";
import { deletePrizeForDb } from "../internal/event.service";

export const deletePrize = lotteryConfigProcedure
  .input(deletePrizeInputSchema)
  .mutation(async ({ ctx, input }) => {
    return await deletePrizeForDb(ctx.db, input.prizeId);
  });
