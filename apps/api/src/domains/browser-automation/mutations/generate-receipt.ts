import { db } from "#db/index.ts";
import {
  ditherImage,
  renderDitheredToPng,
} from "#domains/image-manipulation/internal/image-manipulation.utils.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { serializeTicketSearch } from "#lib/ticket-names-url.ts";
import {
  MAX_TICKET_NAME_LENGTH,
  MAX_TICKET_NAMES,
  TicketNameModerationError,
  assertTicketNames,
} from "@dither-booth/moderation";
import { getPort } from "@dither-booth/ports";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const DATA_URL_REGEX = /^data:([^;]+);base64,(.+)$/;

const parseReceiptImageDataUrl = (
  dataUrl: string,
): { buffer: Buffer } => {
  const m = DATA_URL_REGEX.exec(dataUrl.trim());
  if (!m) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Receipt image must be a base64 data URL.",
    });
  }
  const mimeType = m[1];
  const b64 = m[2];
  if (mimeType === undefined || b64 === undefined) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Receipt image must be a base64 data URL.",
    });
  }
  if (!mimeType.startsWith("image/")) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Receipt image must use an image/* data URL.",
    });
  }
  const buffer = Buffer.from(b64, "base64");
  return { buffer };
};

const RECEIPT_GENERATION_FAILED_MESSAGE = "Failed to generate receipt.";

const receiptViewerBaseUrl = new URL(
  "/receipt-viewer",
  `http://localhost:${getPort("WEB_PORT")}`,
);

export const generateReceipt = publicProcedure
  .input(
    z.object({
      image: z.string().min(1, "Receipt image is required."),
      names: z.array(z.string().max(MAX_TICKET_NAME_LENGTH)).max(MAX_TICKET_NAMES).optional(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const names =
      input.names?.map((n) => n.trim()).filter(Boolean).slice(0, MAX_TICKET_NAMES) ?? [];

    try {
      assertTicketNames(names);

      const { buffer: inputBuffer } = parseReceiptImageDataUrl(input.image);

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

      const dithered = await ditherImage(
        inputBuffer as Parameters<typeof ditherImage>[0],
        ditherConfiguration,
      ).catch(
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

      const receiptViewerUrl = (() => {
        if (names.length === 0) {
          return receiptViewerBaseUrl.toString();
        }
        const url = new URL(receiptViewerBaseUrl.href);
        url.search = serializeTicketSearch({ ticket: names });
        return url.toString();
      })();

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
      if (error instanceof TicketNameModerationError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
          cause: error,
        });
      }

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
