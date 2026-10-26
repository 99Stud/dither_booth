import { octetInputParser } from "@trpc/server/http";

import { boothProcedure } from "#internal/trpc";

/**
 * First half of a booth visit: commit the draw and render both tickets while
 * the kiosk plays the slot machine. `printPreparedReceipt` prints them later.
 */
export const prepareReceipt = boothProcedure
  .input(octetInputParser)
  .mutation(({ ctx, input }) => ctx.tickets.prepareVisit(input));
