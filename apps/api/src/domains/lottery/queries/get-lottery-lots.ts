import { db } from "#db/index.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { lotteryLotTable } from "#domains/lottery/internal/lottery.schema.ts";
import { asc } from "drizzle-orm";

export const getLotteryLots = publicProcedure.query(async () => {
  return db
    .select()
    .from(lotteryLotTable)
    .orderBy(asc(lotteryLotTable.sortOrder), asc(lotteryLotTable.id));
});
