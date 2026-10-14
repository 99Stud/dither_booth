import type { DrawResult } from "@dither-booth/shared/lottery";

import { octetInputParser } from "@trpc/server/http";

import { boothProcedure } from "#internal/trpc";

import { preparedReceiptStore } from "../internal/prepared-receipt.store";
import {
  assertPrinterAvailable,
  prepareReceiptJob,
} from "../internal/receipt-print.service";

export interface PreparedReceipt {
  draw: DrawResult;
  ticketRef: string;
}

/**
 * First half of a booth visit: commit the draw and render both rasters while
 * the kiosk plays the slot machine. `printPreparedReceipt` prints them later.
 */
export const prepareReceipt = boothProcedure
  .input(octetInputParser)
  .mutation(async ({ ctx, input }): Promise<PreparedReceipt> => {
    assertPrinterAvailable(ctx);

    const job = await prepareReceiptJob({ ctx, input });

    preparedReceiptStore.put(job);

    return { draw: job.draw, ticketRef: job.ticketRef };
  });
