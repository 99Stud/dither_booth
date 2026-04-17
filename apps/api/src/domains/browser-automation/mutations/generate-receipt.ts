import { db } from "#db/index.ts";
import {
  ditherImage,
  renderDitheredToPng,
} from "#domains/image-manipulation/internal/image-manipulation.utils.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { API_BROWSER_LOG_SOURCE } from "#lib/browser/browser.constants.ts";
import { API_REPO_ROOT } from "#lib/constants.ts";
import { serializeTicketSearch } from "#lib/ticket-names-url.ts";
import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import {
  assertTicketNames,
  MAX_TICKET_NAME_LENGTH,
  MAX_TICKET_NAMES,
  TicketNameModerationError,
} from "@dither-booth/moderation";
import { getWebOrigin } from "@dither-booth/ports";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const DATA_URL_REGEX = /^data:([^;]+);base64,(.+)$/;

const parseReceiptImageDataUrl = (dataUrl: string): { buffer: Buffer } => {
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

const roundMs = (since: number) => Math.round((performance.now() - since) * 100) / 100;

export const generateReceipt = publicProcedure
  .input(
    z.object({
      image: z.string().min(1, "Receipt image is required."),
      names: z.array(z.string().max(MAX_TICKET_NAME_LENGTH)).max(MAX_TICKET_NAMES).optional(),
      clientFlowId: z.uuid().optional(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const names =
      input.names
        ?.map((n) => n.trim())
        .filter(Boolean)
        .slice(0, MAX_TICKET_NAMES) ?? [];

    const mutationStartedAt = performance.now();

    try {
      assertTicketNames(names);

      const parseStartedAt = performance.now();
      const { buffer: inputBuffer } = parseReceiptImageDataUrl(input.image);
      const parseDataUrlMs = roundMs(parseStartedAt);

      if (inputBuffer.byteLength === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Photo input was empty.",
        });
      }

      const dbStartedAt = performance.now();
      const ditherConfiguration = await db.query.printConfigTable.findFirst();
      const loadPrintConfigMs = roundMs(dbStartedAt);

      if (!ditherConfiguration) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Dither configuration not found.",
        });
      }

      const ditherStartedAt = performance.now();
      const dithered = await ditherImage(
        inputBuffer as Parameters<typeof ditherImage>[0],
        ditherConfiguration,
      ).catch((error) => {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to process photo.",
          cause: error,
        });
      });
      const ditherMs = roundMs(ditherStartedAt);

      const pngStartedAt = performance.now();
      const ditheredPng = await renderDitheredToPng(dithered, ditherConfiguration.threshold).catch(
        (error) => {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to process photo.",
            cause: error,
          });
        },
      );
      const renderPngMs = roundMs(pngStartedAt);

      if (!ctx.page) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Receipt page is not initialized.",
        });
      }

      const webOrigin = getWebOrigin({ repoRoot: API_REPO_ROOT });
      const receiptViewerBaseUrl = new URL("/receipt-viewer", webOrigin);

      const receiptViewerUrl = (() => {
        if (names.length === 0) {
          return receiptViewerBaseUrl.toString();
        }
        const url = new URL(receiptViewerBaseUrl.href);
        url.search = serializeTicketSearch({ ticket: names });
        return url.toString();
      })();

      const gotoStartedAt = performance.now();
      await ctx.page.goto(receiptViewerUrl, {
        waitUntil: "load",
        timeout: 120_000,
      });
      const puppeteerGotoMs = roundMs(gotoStartedAt);

      const waitImgStartedAt = performance.now();
      const imageElement = await ctx.page.waitForSelector("img#booth-photo");
      const waitReceiptImageSelectorMs = roundMs(waitImgStartedAt);

      if (!imageElement) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Receipt photo element was not found.",
        });
      }

      const decodeStartedAt = performance.now();
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
      const receiptImageDecodeMs = roundMs(decodeStartedAt);

      const waitReceiptStartedAt = performance.now();
      const handle = await ctx.page.locator("div#receipt").waitHandle();
      const waitReceiptLocatorMs = roundMs(waitReceiptStartedAt);

      if (!handle) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Receipt element was not found.",
        });
      }

      const screenshotStartedAt = performance.now();
      const receiptScreenshot = await handle.screenshot({
        type: "webp",
        quality: 100,
        optimizeForSpeed: true,
        encoding: "base64",
      });
      const receiptScreenshotMs = roundMs(screenshotStartedAt);

      if (!receiptScreenshot) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: RECEIPT_GENERATION_FAILED_MESSAGE,
        });
      }

      logKioskEvent("info", API_BROWSER_LOG_SOURCE, "generate-receipt-metrics", {
        details: {
          totalMs: roundMs(mutationStartedAt),
          inputBytes: inputBuffer.byteLength,
          nameCount: names.length,
          parseDataUrlMs,
          loadPrintConfigMs,
          ditherMs,
          renderPngMs,
          puppeteerGotoMs,
          waitReceiptImageSelectorMs,
          receiptImageDecodeMs,
          waitReceiptLocatorMs,
          receiptScreenshotMs,
          ...(input.clientFlowId ? { clientFlowId: input.clientFlowId } : {}),
        },
      });

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

      logKioskEvent("error", API_BROWSER_LOG_SOURCE, "generate-receipt-failed", {
        error: getKioskErrorDiagnostics(error, RECEIPT_GENERATION_FAILED_MESSAGE),
      });

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: RECEIPT_GENERATION_FAILED_MESSAGE,
        cause: error,
      });
    }
  });
