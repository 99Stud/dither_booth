import { TRPCError } from "@trpc/server";
import { octetInputParser } from "@trpc/server/http";

import { db } from "#db/index";
import { autoTuneDitherConfig } from "#domains/image-manipulation/internal/auto-tune-search.utils";
import { publicProcedure } from "#internal/trpc";

export const autoTuneDither = publicProcedure
  .input(octetInputParser)
  .mutation(async ({ input }) => {
    const inputBuffer = Buffer.from(await new Response(input).arrayBuffer());

    if (inputBuffer.byteLength === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Photo input was empty.",
      });
    }

    const printConfiguration = await db.query.printConfigTable.findFirst();

    if (!printConfiguration) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Print configuration not found.",
      });
    }

    try {
      return await autoTuneDitherConfig(inputBuffer, printConfiguration);
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to analyze photo.",
        cause: error,
      });
    }
  });
