import { adminOriginProcedure } from "#internal/trpc";

import { createEventInputSchema } from "../internal/event.constants";
import { createEventForDb } from "../internal/event.service";

export const createEvent = adminOriginProcedure
  .input(createEventInputSchema)
  .mutation(async ({ ctx, input }) => {
    return await createEventForDb(ctx.db, input);
  });
