import { adminOriginProcedure } from "#internal/trpc";

import { updatePrizeInputSchema } from "../internal/event.constants";
import { updatePrizeForDb } from "../internal/event.service";

export const updatePrize = adminOriginProcedure
  .input(updatePrizeInputSchema)
  .mutation(async ({ ctx, input }) => {
    return await updatePrizeForDb(ctx.db, input);
  });
