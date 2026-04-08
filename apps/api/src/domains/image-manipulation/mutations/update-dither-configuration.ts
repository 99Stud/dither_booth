import { PRINT_CONFIG_SINGLETON_ID } from "#db/internal/db.constants.ts";
import { printConfigTable } from "#db/internal/db.schema.ts";
import { CONFIGURE_DITHER_SCHEMA } from "#domains/image-manipulation/internal/image-manipulation.constants.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

export const updateDitherConfiguration = publicProcedure
  .input(CONFIGURE_DITHER_SCHEMA)
  .mutation(async ({ input, ctx }) => {
    try {
      return await ctx.db
        .update(printConfigTable)
        .set(input)
        .where(eq(printConfigTable.id, PRINT_CONFIG_SINGLETON_ID));
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to save dither configuration.",
        cause: error,
      });
    }
  });
