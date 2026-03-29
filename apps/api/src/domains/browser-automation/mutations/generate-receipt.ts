import {
  BOOTH_PHOTO_SELECTOR,
  DEFAULT_RECEIPT_VIEWER_URL,
  DEFAULT_SCREENSHOT_OPTIONS,
  RECEIPT_SELECTOR,
} from "#domains/browser-automation/internal/browser-automation.constants.ts";
import { publicProcedure } from "#trpc.ts";
import z from "zod";

export const generateReceipt = publicProcedure
  .input(
    z.object({
      image: z.string(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    if (!ctx.page) {
      throw new Error("Page not initialized");
    }

    await ctx.page.goto(DEFAULT_RECEIPT_VIEWER_URL);

    const imageElement = await ctx.page.waitForSelector(BOOTH_PHOTO_SELECTOR);

    if (!imageElement) {
      throw new Error("Booth photo element not found.");
    }

    await imageElement.evaluate(async (element, image) => {
      const isImageElement = (
        element: unknown,
      ): element is {
        src: string;
        decode: () => Promise<void>;
      } => {
        return (
          typeof element === "object" &&
          element !== null &&
          "src" in element &&
          typeof (element as { decode?: unknown }).decode === "function"
        );
      };

      if (!isImageElement(element)) {
        throw new Error("Booth photo element is not an image.");
      }

      element.src = image;
      await element.decode();
    }, input.image);

    let receiptScreenshot: Uint8Array | undefined;

    const handle = await ctx.page.locator(RECEIPT_SELECTOR).waitHandle();

    if (handle) {
      receiptScreenshot = await handle.screenshot(DEFAULT_SCREENSHOT_OPTIONS);
    }

    if (!receiptScreenshot) {
      throw new Error("Failed to screenshot receipt.");
    }

    return {
      // Safe assertion : We know the screenshot is a base64 encoded string.
      data: receiptScreenshot as unknown as string,
      mimeType: "image/webp",
    };
  });
