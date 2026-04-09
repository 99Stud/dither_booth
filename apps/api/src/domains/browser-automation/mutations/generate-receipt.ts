import { publicProcedure } from "#internal/trpc.ts";
import { getPort } from "@dither-booth/ports";
import { TRPCError } from "@trpc/server";
import z from "zod";

const RECEIPT_GENERATION_FAILED_MESSAGE = "Failed to generate receipt.";

const receiptViewerUrl = new URL(
  "/receipt-viewer",
  `http://localhost:${getPort("WEB_PORT")}`,
).toString();

export const generateReceipt = publicProcedure
  .input(
    z.object({
      image: z.string().min(1, "Receipt image is required."),
    }),
  )
  .mutation(async ({ input, ctx }) => {
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

        element.src = image;
        await element.decode();
      }, input.image);

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
