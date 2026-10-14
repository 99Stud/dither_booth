import { configProcedure } from "#internal/trpc";

import { listDrawsInputSchema } from "../internal/event.constants";
import { listDrawsForDb } from "../internal/event.service";

export const listDraws = configProcedure
  .input(listDrawsInputSchema)
  .query(async ({ ctx, input }) => {
    return await listDrawsForDb(ctx.db, input);
  });
