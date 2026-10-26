import { boothTicketRefSchema } from "@dither-booth/shared/ticket";
import z from "zod";

import { boothProcedure } from "#internal/trpc";

/** Second half of a booth visit: prints what `prepareReceipt` rendered. */
export const printPreparedReceipt = boothProcedure
  .input(z.object({ ticketRef: boothTicketRefSchema }))
  .mutation(({ ctx, input }) => ctx.tickets.printVisit(input.ticketRef));
