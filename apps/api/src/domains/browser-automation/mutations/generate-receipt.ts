import { publicProcedure } from "#internal/trpc.ts";
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

    await ctx.page.goto("http://localhost:9998/receipt-viewer");

    const imageElement = await ctx.page.waitForSelector("img#booth-photo");

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

    let receiptScreenshot: string | undefined;

    const handle = await ctx.page.locator("div#receipt").waitHandle();

    if (handle) {
      receiptScreenshot = await handle.screenshot({
        type: "webp",
        quality: 100,
        optimizeForSpeed: true,
        encoding: "base64",
      });
    }

    if (!receiptScreenshot) {
      throw new Error("Failed to screenshot receipt.");
    }

    return {
      data: receiptScreenshot,
      mimeType: "image/webp",
    };
  });
