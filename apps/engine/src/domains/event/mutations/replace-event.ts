import { createEventInputSchema } from "../internal/event.constants";
import { newEventConfigProcedure } from "../internal/event.kiosk";
import { replaceEventForDb } from "../internal/event.service";

export const replaceEvent = newEventConfigProcedure
  .input(createEventInputSchema)
  .mutation(async ({ ctx, input }) => {
    return await replaceEventForDb(ctx.db, input);
  });
