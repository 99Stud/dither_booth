import { publicProcedure } from "#internal/trpc";

import { getLotteryStatusForDb } from "../internal/lottery.status";

export const getLotteryStatus = publicProcedure.query(async ({ ctx }) => {
  return await getLotteryStatusForDb(ctx.db);
});
