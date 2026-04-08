import { printConfigTable } from "#db/internal/db.schema.ts";
import { CONFIGURE_DITHER_SCHEMA } from "#domains/image-manipulation/internal/image-manipulation.constants.ts";
import { publicProcedure } from "#internal/trpc.ts";

export const createDitherConfiguration = publicProcedure
  .input(CONFIGURE_DITHER_SCHEMA)
  .mutation(({ input, ctx }) => {
    return ctx.db.insert(printConfigTable).values(input);
  });
