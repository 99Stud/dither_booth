import { db } from "#db/index.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { lotteryLotTable } from "#domains/lottery/internal/lottery.schema.ts";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const deleteLotteryLot = publicProcedure
  .input(z.object({ id: z.number().int() }))
  .mutation(async ({ input }) => {
    const existing = await db.query.lotteryLotTable.findFirst({
      where: eq(lotteryLotTable.id, input.id),
    });

    if (!existing) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Lot with id ${input.id} not found.`,
      });
    }

    await db
      .delete(lotteryLotTable)
      .where(eq(lotteryLotTable.id, input.id));

    return { success: true };
  });
