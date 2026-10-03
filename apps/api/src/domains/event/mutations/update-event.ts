import { adminOriginProcedure } from "#internal/trpc";

import { updateEventInputSchema } from "../internal/event.constants";
import { updateEventForDb } from "../internal/event.service";

export const updateEvent = adminOriginProcedure
  .input(updateEventInputSchema)
  .mutation(async ({ ctx, input }) => {
    return await updateEventForDb(ctx.db, input);
  });
