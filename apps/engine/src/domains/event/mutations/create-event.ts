import { configProcedure } from "#internal/trpc";

import { createEventInputSchema } from "../internal/event.constants";
import { createEventForDb } from "../internal/event.service";

export const createEvent = configProcedure
  .input(createEventInputSchema)
  .mutation(async ({ ctx, input }) => {
    return await createEventForDb(ctx.db, input);
  });
