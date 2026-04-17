import { API_LOTTERY_LOG_SOURCE } from "#domains/lottery/internal/lottery.constants.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { logKioskEvent } from "@dither-booth/logging";
import { getPort } from "@dither-booth/ports";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const lotteryTicketViewerBaseUrl = new URL(
  "/lottery-ticket-viewer",
  `http://localhost:${getPort("WEB_PORT")}`,
);

const roundMs = (since: number) => Math.round((performance.now() - since) * 100) / 100;

export const generateLotteryTicket = publicProcedure
  .input(
    z.object({
      outcome: z.enum(["win", "loss"]),
      lotLabel: z.string().nullable().optional(),
      lotRarity: z.string().nullable().optional(),
      clientFlowId: z.string().uuid().optional(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const mutationStartedAt = performance.now();

    if (!ctx.page) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Receipt page is not initialized.",
      });
    }

    const url = new URL(lotteryTicketViewerBaseUrl.href);
    url.searchParams.set("outcome", input.outcome);
    if (input.lotLabel) url.searchParams.set("lotLabel", input.lotLabel);
    if (input.lotRarity) url.searchParams.set("lotRarity", input.lotRarity);

    const gotoStartedAt = performance.now();
    await ctx.page.goto(url.toString(), {
      waitUntil: "load",
      timeout: 120_000,
    });
    const puppeteerGotoMs = roundMs(gotoStartedAt);

    const waitStartedAt = performance.now();
    const handle = await ctx.page.locator("div#lottery-ticket").waitHandle();
    const waitTicketLocatorMs = roundMs(waitStartedAt);

    if (!handle) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Lottery ticket element was not found.",
      });
    }

    const screenshotStartedAt = performance.now();
    const ticketScreenshot = await handle.screenshot({
      type: "webp",
      quality: 100,
      optimizeForSpeed: true,
      encoding: "base64",
    });
    const ticketScreenshotMs = roundMs(screenshotStartedAt);

    if (!ticketScreenshot) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to generate lottery ticket.",
      });
    }

    logKioskEvent("info", API_LOTTERY_LOG_SOURCE, "generate-lottery-ticket-metrics", {
      details: {
        totalMs: roundMs(mutationStartedAt),
        puppeteerGotoMs,
        waitTicketLocatorMs,
        ticketScreenshotMs,
        outcome: input.outcome,
        ...(input.clientFlowId ? { clientFlowId: input.clientFlowId } : {}),
      },
    });

    return {
      data: ticketScreenshot,
      mimeType: "image/webp",
    };
  });
