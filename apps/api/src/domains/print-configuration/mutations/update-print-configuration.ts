import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { PRINT_CONFIG_SINGLETON_ID } from "#db/internal/db.constants";
import { printConfigTable } from "#db/internal/db.schema";
import { UPDATE_PRINT_CONFIGURATION_SCHEMA } from "#domains/print-configuration/internal/print-configuration.constants";
import { publicProcedure } from "#internal/trpc";

export const updatePrintConfiguration = publicProcedure
  .input(UPDATE_PRINT_CONFIGURATION_SCHEMA)
  .mutation(async ({ input, ctx }) => {
    return await ctx.db
      .update(printConfigTable)
      .set(input)
      .where(eq(printConfigTable.id, PRINT_CONFIG_SINGLETON_ID))
      .catch((error) => {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to save print configuration.",
          cause: error,
        });
      });
  });
