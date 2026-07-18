import { adminOriginProcedure } from "#internal/trpc";

import { createLotInputSchema } from "../internal/event.constants";
import { createLotForDb } from "../internal/event.service";

export const createLot = adminOriginProcedure
  .input(createLotInputSchema)
  .mutation(async ({ ctx, input }) => {
    return await createLotForDb(ctx.db, input);
  });
