import { db, sqlite } from "#db/index.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { APPLY_LOTTERY_PRESET_SCHEMA } from "#domains/lottery/internal/lottery.constants.ts";
import { lotteryLotTable, lotteryPresetTable } from "#domains/lottery/internal/lottery.schema.ts";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

type PresetLine = {
  label: string;
  stockTotal: number;
  baseWeight: number;
  rarity: string;
  sortOrder: number;
  description?: string | null;
  instructions?: string | null;
};

export const applyLotteryPreset = publicProcedure
  .input(APPLY_LOTTERY_PRESET_SCHEMA)
  .mutation(async ({ input }) => {
    const preset = await db.query.lotteryPresetTable.findFirst({
      where: eq(lotteryPresetTable.id, input.presetId),
    });

    if (!preset) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Preset introuvable.",
      });
    }

    let lines: PresetLine[];
    try {
      lines = JSON.parse(preset.linesJson) as PresetLine[];
    } catch {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Preset corrompu.",
      });
    }

    if (!Array.isArray(lines) || lines.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Le preset ne contient aucune ligne.",
      });
    }

    sqlite.transaction(() => {
      db.delete(lotteryLotTable).run();

      for (const line of lines) {
        db.insert(lotteryLotTable)
          .values({
            label: line.label,
            stockTotal: line.stockTotal,
            stockRemaining: line.stockTotal,
            baseWeight: line.baseWeight,
            rarity: line.rarity as
              | "common"
              | "medium"
              | "rare"
              | "very_rare",
            description: line.description ?? null,
            instructions: line.instructions ?? null,
            sortOrder: line.sortOrder,
            active: true,
          })
          .run();
      }
    })();

    return { applied: lines.length as number };
  });
