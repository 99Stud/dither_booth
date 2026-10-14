import type { DrawResult } from "@dither-booth/shared/lottery";

import { octetInputParser } from "@trpc/server/http";

import { configProcedure } from "#internal/trpc";

import {
  assertPrinterAvailable,
  prepareReceiptJob,
  printPreparedReceiptJob,
} from "../internal/receipt-print.service";

/** Draw and print in one go. Used by the admin test print. */
export const printReceipt = configProcedure
  .input(octetInputParser)
  .mutation(async ({ ctx, input }): Promise<DrawResult> => {
    const { dryRun, printerUSBAdapter } = assertPrinterAvailable(ctx);
    const job = await prepareReceiptJob({ ctx, input });

    await printPreparedReceiptJob({ dryRun, job, printerUSBAdapter });

    return job.draw;
  });
