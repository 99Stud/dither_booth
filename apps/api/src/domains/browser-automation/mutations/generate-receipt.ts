import { TRPCError } from "@trpc/server";
import { octetInputParser } from "@trpc/server/http";

import { db } from "#db/index";
import { gsV0RasterCommandToPngBuffer } from "#domains/image-manipulation/internal/image-manipulation.utils";
import { buildReceiptRasterCommand } from "#domains/printer/internal/receipt-raster.utils";
import { publicProcedure } from "#internal/trpc";

export const generateReceipt = publicProcedure
  .input(octetInputParser)
  .mutation(async ({ ctx, input }) => {
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

    const previewBuffer = await gsV0RasterCommandToPngBuffer(rasterCmd).catch(
      (error) => {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to convert raster command to PNG buffer.",
          cause: error,
        });
      },
    );

    return {
      data: previewBuffer.toString("base64"),
      mimeType: "image/png",
    };
  });
