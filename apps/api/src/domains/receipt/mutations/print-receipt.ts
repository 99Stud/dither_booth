import { octetInputParser } from "@trpc/server/http";

import type { DrawResult } from "#domains/lottery/internal/lottery.types";

import { publicProcedure } from "#internal/trpc";

import {
  assertPrinterAvailable,
  prepareReceiptJob,
  printPreparedReceiptJob,
} from "../internal/receipt-print.service";

/** Draw and print in one go. Used by the admin test print. */
export const printReceipt = publicProcedure
  .input(octetInputParser)
  .mutation(async ({ ctx, input }): Promise<DrawResult> => {
    const { dryRun, printerUSBAdapter } = assertPrinterAvailable(ctx);
    const job = await prepareReceiptJob({ ctx, input });

    await printPreparedReceiptJob({ dryRun, job, printerUSBAdapter });

    return job.draw;
  });
