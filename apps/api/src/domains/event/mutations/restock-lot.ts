import { adminOriginProcedure } from "#internal/trpc";

import { restockLotInputSchema } from "../internal/event.constants";
import { restockLotForDb } from "../internal/event.service";

export const restockLot = adminOriginProcedure
  .input(restockLotInputSchema)
  .mutation(async ({ ctx, input }) => {
    return await restockLotForDb(ctx.db, input);
  });
