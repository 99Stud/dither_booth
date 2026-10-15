import { darkroomProcedure } from "#internal/trpc";

import { getCurrentEventForDb } from "../internal/event.service";

export const getCurrentEvent = darkroomProcedure.query(async ({ ctx }) => {
  return await getCurrentEventForDb(ctx.db);
});
