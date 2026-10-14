import { configProcedure } from "#internal/trpc";

import { updatePrizeInputSchema } from "../internal/event.constants";
import { updatePrizeForDb } from "../internal/event.service";

export const updatePrize = configProcedure
  .input(updatePrizeInputSchema)
  .mutation(async ({ ctx, input }) => {
    return await updatePrizeForDb(ctx.db, input);
  });
