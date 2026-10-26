import { createPrizeInputSchema } from "../internal/event.constants";
import { lotteryConfigProcedure } from "../internal/event.kiosk";
import { createPrizeForDb } from "../internal/event.service";

export const createPrize = lotteryConfigProcedure
  .input(createPrizeInputSchema)
  .mutation(async ({ ctx, input }) => {
    return await createPrizeForDb(ctx.db, input);
  });
