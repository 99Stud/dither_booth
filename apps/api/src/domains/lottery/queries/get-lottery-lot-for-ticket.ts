import { db } from "#db/index.ts";
import { lotteryLotTable } from "#domains/lottery/internal/lottery.schema.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const getLotteryLotForTicket = publicProcedure
  .input(z.object({ id: z.number().int().positive() }))
  .query(async ({ input }) => {
    const lot = await db.query.lotteryLotTable.findFirst({
      where: eq(lotteryLotTable.id, input.id),
    });
    if (!lot) return null;
    return {
      label: lot.label,
      rarity: lot.rarity,
      description: lot.description,
      instructions: lot.instructions,
    };
  });
