import { TRPCError } from "@trpc/server";

import { adminOriginProcedure } from "#internal/trpc";

export const restartPuppeteerReceiptViewer = adminOriginProcedure.mutation(
  async ({ ctx }) => {
    try {
      return await ctx.puppeteerLifecycle.restart();
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to restart Puppeteer receipt viewer.",
        cause: error,
      });
    }
  },
);
