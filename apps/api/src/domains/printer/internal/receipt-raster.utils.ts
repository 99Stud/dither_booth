import type { ElementHandle, Page } from "puppeteer";

import { TRPCError } from "@trpc/server";

import type { PrintConfigRow } from "#domains/image-manipulation/internal/image-manipulation.types";

import {
  ditherImage,
  screenshotToGsV0RasterCommand,
} from "#domains/image-manipulation/internal/image-manipulation.utils";

import { PRINT_WIDTH_PX } from "./printer.constants";

const RECEIPT_GENERATION_FAILED_MESSAGE = "Failed to generate receipt.";

export async function buildReceiptRasterCommand({
  page,
  photoBuffer,
  ditherConfiguration,
}: {
  page: Page;
  photoBuffer: Buffer<ArrayBuffer>;
  ditherConfiguration: PrintConfigRow;
}): Promise<Buffer> {
  const deviceScaleFactor = page.viewport()?.deviceScaleFactor ?? 1;

  const dithered = await ditherImage(photoBuffer, ditherConfiguration, {
    width: PRINT_WIDTH_PX * deviceScaleFactor,
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

    const imageHandle: ElementHandle = await page
      .locator("img#booth-photo")
      .waitHandle()
      .catch((error) => {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Receipt photo element was not found.",
          cause: error,
        });
      });

    const ditheredImageData = await ditheredImageDataPromise;

    if (!ditheredImageData.ok) {
      throw ditheredImageData.error;
    }

    await imageHandle.evaluate(
      async (element: unknown, image: { data: string; mimeType: string }) => {
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

    const receiptHandle: ElementHandle = await page
      .locator("div#receipt")
      .waitHandle()
      .catch((error) => {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Receipt element was not found.",
          cause: error,
        });
      });

    const receiptScreenshot = await receiptHandle
      .screenshot({
        optimizeForSpeed: true,
      })
      .catch((error) => {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to screenshot receipt element.",
          cause: error,
        });
      });

    return await screenshotToGsV0RasterCommand(receiptScreenshot, {
      threshold: ditherConfiguration.threshold,
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
