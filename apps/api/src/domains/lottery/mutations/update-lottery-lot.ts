import { db } from "#db/index.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { UPDATE_LOT_SCHEMA } from "#domains/lottery/internal/lottery.constants.ts";
import { lotteryLotTable } from "#domains/lottery/internal/lottery.schema.ts";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const updateLotteryLot = publicProcedure
  .input(UPDATE_LOT_SCHEMA)
  .mutation(async ({ input }) => {
    const { id, ...updates } = input;

    const existing = await db.query.lotteryLotTable.findFirst({
      where: eq(lotteryLotTable.id, id),
    });

    if (!existing) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Lot with id ${id} not found.`,
      });
    }

    return db
      .update(lotteryLotTable)
      .set(updates)
      .where(eq(lotteryLotTable.id, id))
      .returning()
      .then((rows) => rows[0]!);
  });
