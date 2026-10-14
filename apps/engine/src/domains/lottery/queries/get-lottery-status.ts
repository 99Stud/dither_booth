import { boothProcedure } from "#internal/trpc";

import { getLotteryStatusForDb } from "../internal/lottery.status";

export const getLotteryStatus = boothProcedure.query(async ({ ctx }) => {
  return await getLotteryStatusForDb(ctx.db);
});
