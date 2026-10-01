import { adminOriginProcedure } from "#internal/trpc";

import { restockPrizeInputSchema } from "../internal/event.constants";
import { restockPrizeForDb } from "../internal/event.service";

export const restockPrize = adminOriginProcedure
  .input(restockPrizeInputSchema)
  .mutation(async ({ ctx, input }) => {
    return await restockPrizeForDb(ctx.db, input);
  });
