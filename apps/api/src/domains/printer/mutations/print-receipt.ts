import { TRPCError } from "@trpc/server";
import { octetInputParser } from "@trpc/server/http";

import { db } from "#db/index";
import { printRasterReceipt } from "#domains/printer/internal/printer.utils";
import { buildReceiptRasterCommand } from "#domains/printer/internal/receipt-raster.utils";
import { publicProcedure } from "#internal/trpc";

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

    const page = ctx.page;

    if (!page) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Puppeteer page is not initialized.",
      });
    }

    const inputBuffer = Buffer.from(await new Response(input).arrayBuffer());

    if (inputBuffer.byteLength === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Photo input was empty.",
      });
    }

    const ditherConfiguration = await db.query.printConfigTable.findFirst();

    if (!ditherConfiguration) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Dither configuration not found.",
      });
    }

    const rasterCmd = await buildReceiptRasterCommand({
      page,
      photoBuffer: inputBuffer,
      ditherConfiguration,
    });

    await printRasterReceipt(printerUSBAdapter, rasterCmd).catch((error) => {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to print receipt.",
        cause: error,
      });
    });
  });
