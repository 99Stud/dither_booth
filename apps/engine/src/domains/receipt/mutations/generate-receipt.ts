import { TRPCError } from "@trpc/server";
import { octetInputParser } from "@trpc/server/http";

import { publicProcedure } from "#internal/trpc";

import { gsV0RasterCommandToPngBuffer } from "../internal/gs-v0-raster.utils";
import { prepareReceiptRasterCommand } from "../internal/receipt-raster.utils";

export const generateReceipt = publicProcedure
  .input(octetInputParser)
  .mutation(async ({ ctx, input }) => {
    const rasterCmd = await prepareReceiptRasterCommand({ ctx, input });

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
