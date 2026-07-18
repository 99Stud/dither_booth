import { adminOriginProcedure } from "#internal/trpc";

import { updateLotInputSchema } from "../internal/event.constants";
import { updateLotForDb } from "../internal/event.service";

export const updateLot = adminOriginProcedure
  .input(updateLotInputSchema)
  .mutation(async ({ ctx, input }) => {
    return await updateLotForDb(ctx.db, input);
  });
