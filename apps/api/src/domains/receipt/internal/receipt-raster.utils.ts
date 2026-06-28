import type { Page } from "puppeteer";

import { PRINT_WIDTH_PX } from "@dither-booth/shared/printing";
import { TRPCError } from "@trpc/server";

import type { PrintConfigRow } from "#domains/print-configuration/print-configuration.service";
import type { TRPCContext } from "#lib/trpc/trpc.types";

import { ditherImage } from "#domains/image-manipulation/image-manipulation.service";

import { screenshotToGsV0RasterCommand } from "./gs-v0-raster.utils";
import {
  captureReceiptScreenshot,
  runExclusiveReceiptViewerPageJob,
} from "./receipt-viewer-page.utils";

const RECEIPT_GENERATION_FAILED_MESSAGE = "Failed to generate receipt.";

export async function prepareReceiptRasterCommand({
  ctx,
  input,
}: {
  ctx: Pick<TRPCContext, "db" | "page">;
  input: ConstructorParameters<typeof Response>[0];
}): Promise<Buffer> {
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

  const printConfiguration = await ctx.db.query.printConfigTable.findFirst();

  if (!printConfiguration) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Print configuration not found.",
    });
  }

  return await buildReceiptRasterCommand({
    page,
    photoBuffer: inputBuffer,
    printConfiguration,
  });
}

export async function buildReceiptRasterCommand({
  page,
  photoBuffer,
  printConfiguration,
}: {
  page: Page;
  photoBuffer: Buffer<ArrayBuffer>;
  printConfiguration: PrintConfigRow;
}): Promise<Buffer> {
  const deviceScaleFactor = page.viewport()?.deviceScaleFactor ?? 1;

  const dithered = await ditherImage(photoBuffer, printConfiguration, {
    width: PRINT_WIDTH_PX * deviceScaleFactor,
  }).catch((error) => {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to process photo.",
      cause: error,
    });
  });

  try {
    const ditheredImageData = (await dithered.png().toBuffer()).toBase64();

    const receiptScreenshot = await runExclusiveReceiptViewerPageJob(() =>
      captureReceiptScreenshot({
        image: {
          data: ditheredImageData,
          mimeType: "image/png",
        },
        page,
        template: printConfiguration.template,
      }),
    );

    return await screenshotToGsV0RasterCommand(receiptScreenshot, {
      threshold: printConfiguration.threshold,
      width: PRINT_WIDTH_PX,
    }).catch((error) => {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to convert receipt screenshot to raster command.",
        cause: error,
      });
    });
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: RECEIPT_GENERATION_FAILED_MESSAGE,
      cause: error,
    });
  }
}
