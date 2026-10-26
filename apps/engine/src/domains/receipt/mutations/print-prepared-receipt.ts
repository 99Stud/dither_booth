import { boothTicketRefSchema } from "@dither-booth/shared/ticket";
import { TRPCError } from "@trpc/server";
import z from "zod";

import { boothProcedure } from "#internal/trpc";

import { preparedReceiptStore } from "../internal/prepared-receipt.store";
import {
  assertPrinterAvailable,
  printPreparedReceiptJob,
} from "../internal/receipt-print.service";

export const printPreparedReceipt = boothProcedure
  .input(z.object({ ticketRef: boothTicketRefSchema }))
  .mutation(async ({ ctx, input }): Promise<void> => {
    const print = assertPrinterAvailable(ctx);
    const job = preparedReceiptStore.take(input.ticketRef);

    if (!job) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `No prepared receipt for ticket ${input.ticketRef}.`,
      });
    }

    try {
      await printPreparedReceiptJob({ job, print });
    } catch (error) {
      // Taken out while printing so a double submit cannot print twice; put
      // back on failure so the kiosk can retry (only the unprinted parts).
      preparedReceiptStore.put(job);
      throw error;
    }
  });
