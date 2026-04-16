import { db } from "#db/index.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { CREATE_LOT_SCHEMA } from "#domains/lottery/internal/lottery.constants.ts";
import { lotteryLotTable } from "#domains/lottery/internal/lottery.schema.ts";

export const createLotteryLot = publicProcedure
  .input(CREATE_LOT_SCHEMA)
  .mutation(async ({ input }) => {
    return db
      .insert(lotteryLotTable)
      .values({
        label: input.label,
        stockTotal: input.stockTotal,
        stockRemaining: input.stockTotal,
        baseWeight: input.baseWeight,
        rarity: input.rarity,
        active: input.active,
        sortOrder: input.sortOrder,
      })
      .returning()
      .then((rows) => rows[0]!);
  });
