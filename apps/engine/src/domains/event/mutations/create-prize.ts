import { configProcedure } from "#internal/trpc";

import { createPrizeInputSchema } from "../internal/event.constants";
import { createPrizeForDb } from "../internal/event.service";

export const createPrize = configProcedure
  .input(createPrizeInputSchema)
  .mutation(async ({ ctx, input }) => {
    return await createPrizeForDb(ctx.db, input);
  });
