import { configProcedure } from "#internal/trpc";

import { createEventInputSchema } from "../internal/event.constants";
import { replaceEventForDb } from "../internal/event.service";

export const replaceEvent = configProcedure
  .input(createEventInputSchema)
  .mutation(async ({ ctx, input }) => {
    return await replaceEventForDb(ctx.db, input);
  });
