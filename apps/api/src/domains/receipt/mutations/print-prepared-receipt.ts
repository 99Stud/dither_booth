import { BOOTH_TICKET_REF_PATTERN } from "@dither-booth/shared/formatting";
import { TRPCError } from "@trpc/server";
import z from "zod";

import { publicProcedure } from "#internal/trpc";

import { preparedReceiptStore } from "../internal/prepared-receipt.store";
import {
  assertPrinterAvailable,
  printPreparedReceiptJob,
} from "../internal/receipt-print.service";

export const printPreparedReceipt = publicProcedure
  .input(z.object({ ticketRef: z.string().regex(BOOTH_TICKET_REF_PATTERN) }))
  .mutation(async ({ ctx, input }): Promise<void> => {
    const { dryRun, printerUSBAdapter } = assertPrinterAvailable(ctx);
    const job = preparedReceiptStore.take(input.ticketRef);

    if (!job) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `No prepared receipt for ticket ${input.ticketRef}.`,
      });
    }

    await printPreparedReceiptJob({ dryRun, job, printerUSBAdapter });
  });
