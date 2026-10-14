import { configProcedure } from "#internal/trpc";

import { getCurrentEventForDb } from "../internal/event.service";

export const getCurrentEvent = configProcedure.query(async ({ ctx }) => {
  return await getCurrentEventForDb(ctx.db);
});
