import { printConfigTable } from "#db/internal/db.schema.ts";
import { CONFIGURE_DITHER_SCHEMA } from "#domains/image-manipulation/internal/image-manipulation.constants.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { TRPCError } from "@trpc/server";

export const createDitherConfiguration = publicProcedure
  .input(CONFIGURE_DITHER_SCHEMA)
  .mutation(async ({ input, ctx }) => {
    try {
      return await ctx.db.insert(printConfigTable).values(input);
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to save dither configuration.",
        cause: error,
      });
    }
  });
