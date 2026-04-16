import { db } from "#db/index.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { lotteryPresetTable } from "#domains/lottery/internal/lottery.schema.ts";
import { desc } from "drizzle-orm";

export const getLotteryPresets = publicProcedure.query(async () => {
  return db
    .select({
      id: lotteryPresetTable.id,
      name: lotteryPresetTable.name,
      createdAt: lotteryPresetTable.createdAt,
    })
    .from(lotteryPresetTable)
    .orderBy(desc(lotteryPresetTable.id))
    .all();
});
