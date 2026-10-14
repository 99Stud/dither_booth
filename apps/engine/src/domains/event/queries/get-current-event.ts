import { adminOriginProcedure } from "#internal/trpc";

import { getCurrentEventForDb } from "../internal/event.service";

export const getCurrentEvent = adminOriginProcedure.query(async ({ ctx }) => {
  return await getCurrentEventForDb(ctx.db);
});
