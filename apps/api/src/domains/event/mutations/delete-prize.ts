import { adminOriginProcedure } from "#internal/trpc";

import { deletePrizeInputSchema } from "../internal/event.constants";
import { deletePrizeForDb } from "../internal/event.service";

export const deletePrize = adminOriginProcedure
  .input(deletePrizeInputSchema)
  .mutation(async ({ ctx, input }) => {
    return await deletePrizeForDb(ctx.db, input.prizeId);
  });
