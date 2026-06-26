import { TRPCError } from "@trpc/server";
import { octetInputParser } from "@trpc/server/http";

import { printRasterReceipt } from "#domains/printer/printer.service";
import { publicProcedure } from "#internal/trpc";

import { prepareReceiptRasterCommand } from "../internal/receipt-raster.utils";

export const printReceipt = publicProcedure
  .input(octetInputParser)
  .mutation(async ({ ctx, input }) => {
    const printerUSBAdapter = ctx.printerUSBAdapter;

    if (!printerUSBAdapter) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "No printer device available.",
      });
    }

    const rasterCmd = await prepareReceiptRasterCommand({ ctx, input });

    await printRasterReceipt(printerUSBAdapter, rasterCmd).catch((error) => {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to print receipt.",
        cause: error,
      });
    });
  });
