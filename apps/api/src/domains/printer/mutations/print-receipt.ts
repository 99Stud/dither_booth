import { TRPCError } from "@trpc/server";
import { octetInputParser } from "@trpc/server/http";

import { db } from "#db/index";
import {
  ditherImage,
  screenshotToGsV0RasterCommand,
} from "#domains/image-manipulation/internal/image-manipulation.utils";
import { PRINT_WIDTH_PX } from "#domains/printer/internal/printer.constants";
import { printRasterReceipt } from "#domains/printer/internal/printer.utils";
import { publicProcedure } from "#internal/trpc";

const RECEIPT_GENERATION_FAILED_MESSAGE = "Failed to generate receipt.";

export const printReceipt = publicProcedure
  .input(octetInputParser)
  .mutation(async ({ ctx, input }) => {
    const printerUSBAdapter = ctx.printerUSBAdapter;
    const page = ctx.page;

    if (!printerUSBAdapter) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "No printer device available.",
      });
    }

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

    const dithered = await ditherImage(inputBuffer, ditherConfiguration, {
      width: PRINT_WIDTH_PX,
    }).catch((error) => {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to process photo.",
        cause: error,
      });
    });

    try {
      const ditheredImageDataPromise = dithered
        .png()
        .toBuffer()
        .then(
          (buffer) => ({
            data: buffer.toBase64(),
            ok: true as const,
          }),
          (error: unknown) => ({
            error,
            ok: false as const,
          }),
        );
      const imageElement = await page.waitForSelector("img#booth-photo");

      if (!imageElement) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Receipt photo element was not found.",
        });
      }

      const ditheredImageData = await ditheredImageDataPromise;

      if (!ditheredImageData.ok) {
        throw ditheredImageData.error;
      }

      await imageElement.evaluate(
        async (element, image) => {
          // INFO: do not extract this function, puppeteer needs this to be created on runtime
          const isImageElement = (
            element: unknown,
          ): element is {
            src: string;
            decode: () => Promise<undefined>;
          } => {
            return (
              element !== null &&
              typeof element === "object" &&
              "src" in element &&
              typeof element.src === "string" &&
              "decode" in element &&
              typeof element.decode === "function"
            );
          };

          if (!isImageElement(element)) {
            throw new Error("Receipt photo element is not an image.");
          }

          element.src = `data:${image.mimeType};base64,${image.data}`;
          await element.decode();
        },
        {
          data: ditheredImageData.data,
          mimeType: "image/png",
        },
      );

      const handle = await page.locator("div#receipt").waitHandle();

      if (!handle) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Receipt element was not found.",
        });
      }

      const receiptScreenshot: Uint8Array | undefined = await handle.screenshot(
        {
          optimizeForSpeed: true,
        },
      );

      if (!receiptScreenshot) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: RECEIPT_GENERATION_FAILED_MESSAGE,
        });
      }

      const rasterCmd = await screenshotToGsV0RasterCommand(receiptScreenshot, {
        threshold: ditherConfiguration.threshold,
        width: PRINT_WIDTH_PX,
      });

      await printRasterReceipt(printerUSBAdapter, rasterCmd).catch((error) => {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to print receipt.",
          cause: error,
        });
      });

      return;
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
  });
