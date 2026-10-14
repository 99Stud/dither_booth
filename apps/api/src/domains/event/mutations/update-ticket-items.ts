import { adminOriginProcedure } from "#internal/trpc";

import { updateTicketItemsInputSchema } from "../internal/event.constants";
import { updateTicketItemsForDb } from "../internal/event.service";

export const updateTicketItems = adminOriginProcedure
  .input(updateTicketItemsInputSchema)
  .mutation(async ({ ctx, input }) => {
    return await updateTicketItemsForDb(ctx.db, input);
  });
