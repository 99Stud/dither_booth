import { adminOriginProcedure } from "#internal/trpc";

import { deleteLotInputSchema } from "../internal/event.constants";
import { deleteLotForDb } from "../internal/event.service";

export const deleteLot = adminOriginProcedure
  .input(deleteLotInputSchema)
  .mutation(async ({ ctx, input }) => {
    return await deleteLotForDb(ctx.db, input.lotId);
  });
