import { db } from "#db/index";
import {
  ditherImage,
  renderDitheredToPng,
} from "#domains/image-manipulation/internal/image-manipulation.utils";
import { publicProcedure } from "#internal/trpc";
import { TRPCError } from "@trpc/server";
import { octetInputParser } from "@trpc/server/http";

export const dither = publicProcedure
  .input(octetInputParser)
  .mutation(async ({ input }) => {
    const inputBuffer = Buffer.from(await new Response(input).arrayBuffer());

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

    try {
      const dithered = await ditherImage(inputBuffer, ditherConfiguration);

      return renderDitheredToPng(dithered, ditherConfiguration.threshold);
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to process photo.",
        cause: error,
      });
    }
  });
