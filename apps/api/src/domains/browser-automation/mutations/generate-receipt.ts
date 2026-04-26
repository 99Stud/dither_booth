import { db } from "#db/index";
import {
  ditherImage,
  renderDitheredToPng,
} from "#domains/image-manipulation/internal/image-manipulation.utils";
import { publicProcedure } from "#internal/trpc";
import { API_REPO_ROOT } from "#lib/constants";
import { getWebOrigin } from "@dither-booth/ports";
import { TRPCError } from "@trpc/server";
import { octetInputParser } from "@trpc/server/http";

const RECEIPT_GENERATION_FAILED_MESSAGE = "Failed to generate receipt.";

export const generateReceipt = publicProcedure
  .input(octetInputParser)
  .mutation(async ({ ctx, input }) => {
    const webOrigin = getWebOrigin({ repoRoot: API_REPO_ROOT });

    if (!webOrigin) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Web origin not found.",
      });
    }
    const receiptViewerUrl = new URL("/receipt-viewer", webOrigin).toString();

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

    const dithered = await ditherImage(inputBuffer, ditherConfiguration).catch(
      (error) => {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to process photo.",
          cause: error,
        });
      },
    );

    const ditheredPng = await renderDitheredToPng(
      dithered,
      ditherConfiguration.threshold,
    ).catch((error) => {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to process photo.",
        cause: error,
      });
    });

    if (!ctx.page) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Receipt page is not initialized.",
      });
    }

    try {
      await ctx.page.goto(receiptViewerUrl);

      const imageElement = await ctx.page.waitForSelector("img#booth-photo");

      if (!imageElement) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Receipt photo element was not found.",
        });
      }

      await imageElement.evaluate(async (element, image) => {
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
      }, ditheredPng);

      const handle = await ctx.page.locator("div#receipt").waitHandle();

      if (!handle) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Receipt element was not found.",
        });
      }

      const receiptScreenshot = await handle.screenshot({
        type: "webp",
        quality: 100,
        optimizeForSpeed: true,
        encoding: "base64",
      });

      if (!receiptScreenshot) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: RECEIPT_GENERATION_FAILED_MESSAGE,
        });
      }

      return {
        data: receiptScreenshot,
        mimeType: "image/webp",
      };
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
