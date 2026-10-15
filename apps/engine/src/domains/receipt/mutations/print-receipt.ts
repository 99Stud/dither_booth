import { octetInputParser } from "@trpc/server/http";

import { configProcedure } from "#internal/trpc";

import { printTestReceiptJob } from "../internal/receipt-print.service";

/** Admin test print of the photo receipt. Never draws or takes stock. */
export const printReceipt = configProcedure
  .input(octetInputParser)
  .mutation(async ({ ctx, input }): Promise<void> => {
    await printTestReceiptJob({ ctx, input });
  });
