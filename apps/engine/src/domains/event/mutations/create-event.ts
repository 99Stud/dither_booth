import { createEventInputSchema } from "../internal/event.constants";
import { newEventConfigProcedure } from "../internal/event.kiosk";
import { createEventForDb } from "../internal/event.service";

export const createEvent = newEventConfigProcedure
  .input(createEventInputSchema)
  .mutation(async ({ ctx, input }) => {
    return await createEventForDb(ctx.db, input);
  });
