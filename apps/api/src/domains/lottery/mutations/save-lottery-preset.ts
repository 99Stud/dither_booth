import { db } from "#db/index.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { SAVE_LOTTERY_PRESET_SCHEMA } from "#domains/lottery/internal/lottery.constants.ts";
import { lotteryLotTable, lotteryPresetTable } from "#domains/lottery/internal/lottery.schema.ts";
import { asc } from "drizzle-orm";

type PresetLine = {
  label: string;
  stockTotal: number;
  baseWeight: number;
  rarity: string;
  sortOrder: number;
};

export const saveLotteryPreset = publicProcedure
  .input(SAVE_LOTTERY_PRESET_SCHEMA)
  .mutation(async ({ input }) => {
    const lots = await db
      .select()
      .from(lotteryLotTable)
      .orderBy(asc(lotteryLotTable.sortOrder), asc(lotteryLotTable.id))
      .all();

    const lines: PresetLine[] = lots.map((l) => ({
      label: l.label,
      stockTotal: l.stockTotal,
      baseWeight: l.baseWeight,
      rarity: l.rarity,
      sortOrder: l.sortOrder,
    }));

    const [row] = await db
      .insert(lotteryPresetTable)
      .values({
        name: input.name.trim(),
        linesJson: JSON.stringify(lines),
      })
      .returning();

    return row!;
  });
