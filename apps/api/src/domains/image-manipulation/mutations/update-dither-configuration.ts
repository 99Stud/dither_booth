import { PRINT_CONFIG_SINGLETON_ID, printConfigTable } from "#db/schema.ts";
import { CONFIGURE_DITHER_SCHEMA } from "#domains/image-manipulation/internal/image-manipulation.constants.ts";
import { publicProcedure } from "#trpc.ts";
import { eq } from "drizzle-orm";

export const updateDitherConfiguration = publicProcedure
  .input(CONFIGURE_DITHER_SCHEMA)
  .mutation(({ input, ctx }) =>
    ctx.db
      .update(printConfigTable)
      .set(input)
      .where(eq(printConfigTable.id, PRINT_CONFIG_SINGLETON_ID)),
  );
