import { buildLotteryTicketViewerUrl } from "#domains/browser-automation/internal/lottery-ticket-viewer-url.ts";
import {
  gotoAutomation,
  runWithAutomationRetry,
} from "#domains/browser-automation/internal/puppeteer-automation.ts";
import { API_LOTTERY_LOG_SOURCE } from "#domains/lottery/internal/lottery.constants.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { logKioskEvent } from "@dither-booth/logging";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const roundMs = (since: number) => Math.round((performance.now() - since) * 100) / 100;

export const generateLotteryTicket = publicProcedure
  .input(
    z.object({
      outcome: z.enum(["win", "loss"]),
      lotId: z.number().int().positive().optional(),
      lotLabel: z.string().nullable().optional(),
      lotRarity: z.string().nullable().optional(),
      clientFlowId: z.string().uuid().optional(),
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

    const ticketUrl = buildLotteryTicketViewerUrl({
      outcome: input.outcome,
      lotId: input.outcome === "win" ? input.lotId : undefined,
      lotLabel:
        input.outcome === "win" && input.lotId == null ? input.lotLabel : undefined,
      lotRarity:
        input.outcome === "win" && input.lotId == null ? input.lotRarity : undefined,
    });

    const capture = await runWithAutomationRetry(getBrowser()!, async (page) => {
      const gotoStartedAt = performance.now();
      await gotoAutomation(page, ticketUrl);
      const puppeteerGotoMs = roundMs(gotoStartedAt);

      const waitStartedAt = performance.now();
      await page.waitForSelector('#lottery-ticket[data-ticket-ready="true"]', {
        timeout: 120_000,
      });
      const handle = await page.locator("div#lottery-ticket").waitHandle();
      const waitTicketLocatorMs = roundMs(waitStartedAt);

      if (!handle) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lottery ticket element was not found.",
        });
      }

      const screenshotStartedAt = performance.now();
      const ticketScreenshot = await handle.screenshot({
        type: "jpeg",
        quality: 85,
        captureBeyondViewport: false,
        encoding: "base64",
      });
      const ticketScreenshotMs = roundMs(screenshotStartedAt);

      if (!ticketScreenshot) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate lottery ticket.",
        });
      }

      return { ticketScreenshot, puppeteerGotoMs, waitTicketLocatorMs, ticketScreenshotMs };
    }, retryOpts);

    logKioskEvent("info", API_LOTTERY_LOG_SOURCE, "generate-lottery-ticket-metrics", {
      details: {
        totalMs: roundMs(mutationStartedAt),
        puppeteerGotoMs: capture.puppeteerGotoMs,
        waitTicketLocatorMs: capture.waitTicketLocatorMs,
        ticketScreenshotMs: capture.ticketScreenshotMs,
        outcome: input.outcome,
        ...(input.clientFlowId ? { clientFlowId: input.clientFlowId } : {}),
      },
    });

    return {
      data: capture.ticketScreenshot,
      mimeType: "image/jpeg",
    };
  });
