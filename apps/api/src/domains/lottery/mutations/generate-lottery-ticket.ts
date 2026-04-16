import { publicProcedure } from "#internal/trpc.ts";
import { getPort } from "@dither-booth/ports";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const lotteryTicketViewerBaseUrl = new URL(
  "/lottery-ticket-viewer",
  `http://localhost:${getPort("WEB_PORT")}`,
);

export const generateLotteryTicket = publicProcedure
  .input(
    z.object({
      outcome: z.enum(["win", "loss"]),
      lotLabel: z.string().nullable().optional(),
      lotRarity: z.string().nullable().optional(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
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

    await ctx.page.goto(url.toString());

    const handle = await ctx.page.locator("div#lottery-ticket").waitHandle();

    if (!handle) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Lottery ticket element was not found.",
      });
    }

    const ticketScreenshot = await handle.screenshot({
      type: "webp",
      quality: 100,
      optimizeForSpeed: true,
      encoding: "base64",
    });

    if (!ticketScreenshot) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to generate lottery ticket.",
      });
    }

    return {
      data: ticketScreenshot,
      mimeType: "image/webp",
    };
  });
