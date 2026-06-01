import {
  buildReceiptViewerUrl,
  HEIRVEY_RECEIPT_TEMPLATE,
} from "#domains/browser-automation/internal/receipt-viewer-url.ts";
import {
  gotoAutomation,
  runWithAutomationRetry,
} from "#domains/browser-automation/internal/puppeteer-automation.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { API_BROWSER_LOG_SOURCE } from "#lib/browser/browser.constants.ts";
import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const RECEIPT_GENERATION_FAILED_MESSAGE = "Failed to generate Heirvey receipt.";

const roundMs = (since: number) =>
  Math.round((performance.now() - since) * 100) / 100;

export const generateHeirveyReceipt = publicProcedure
  .input(
    z.object({
      clientFlowId: z.uuid().optional(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const mutationStartedAt = performance.now();

    const getBrowser = () => ctx.getPuppeteerBrowser?.() ?? ctx.browser;
    const retryOpts = ctx.relaunchPuppeteerBrowser
      ? { relaunchBrowser: ctx.relaunchPuppeteerBrowser }
      : undefined;

    if (!getBrowser()) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Browser is not initialized.",
      });
    }

    const receiptViewerUrl = await buildReceiptViewerUrl([], {
      template: HEIRVEY_RECEIPT_TEMPLATE,
    });

    try {
      const capture = await runWithAutomationRetry(
        getBrowser()!,
        async (page) => {
          const gotoStartedAt = performance.now();
          await gotoAutomation(page, receiptViewerUrl);
          const puppeteerGotoMs = roundMs(gotoStartedAt);

          const waitStartedAt = performance.now();
          await page.waitForSelector(
            'div#receipt[data-receipt-ready="true"]',
            { timeout: 120_000 },
          );
          const handle = await page.locator("div#receipt").waitHandle();
          const waitReceiptLocatorMs = roundMs(waitStartedAt);

          if (!handle) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Receipt element was not found.",
            });
          }

          const screenshotStartedAt = performance.now();
          const receiptScreenshot = await handle.screenshot({
            type: "jpeg",
            quality: 85,
            captureBeyondViewport: false,
            encoding: "base64",
          });
          const receiptScreenshotMs = roundMs(screenshotStartedAt);

          if (!receiptScreenshot) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: RECEIPT_GENERATION_FAILED_MESSAGE,
            });
          }

          return {
            receiptScreenshot,
            puppeteerGotoMs,
            waitReceiptLocatorMs,
            receiptScreenshotMs,
          };
        },
        retryOpts,
      );

      logKioskEvent(
        "info",
        API_BROWSER_LOG_SOURCE,
        "generate-heirvey-receipt-metrics",
        {
          details: {
            totalMs: roundMs(mutationStartedAt),
            puppeteerGotoMs: capture.puppeteerGotoMs,
            waitReceiptLocatorMs: capture.waitReceiptLocatorMs,
            receiptScreenshotMs: capture.receiptScreenshotMs,
            ...(input.clientFlowId ? { clientFlowId: input.clientFlowId } : {}),
          },
        },
      );

      return {
        data: capture.receiptScreenshot,
        mimeType: "image/jpeg",
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }

      logKioskEvent(
        "error",
        API_BROWSER_LOG_SOURCE,
        "generate-heirvey-receipt-failed",
        {
          error: getKioskErrorDiagnostics(
            error,
            RECEIPT_GENERATION_FAILED_MESSAGE,
          ),
        },
      );

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: RECEIPT_GENERATION_FAILED_MESSAGE,
        cause: error,
      });
    }
  });
