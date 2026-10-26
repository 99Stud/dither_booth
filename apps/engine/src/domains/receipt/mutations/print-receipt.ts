import { octetInputParser } from "@trpc/server/http";

import { darkroomProcedure } from "#internal/trpc";

/** Admin test print of the photo receipt. Never draws or takes stock. */
export const printReceipt = darkroomProcedure
  .input(octetInputParser)
  .mutation(({ ctx, input }) => ctx.tickets.printTestPrint(input));
