import type { Rarity } from "@dither-booth/shared/lottery";
import type { InferSelectModel } from "drizzle-orm";

import {
  DRAW_OUTCOMES,
  type drawTable,
  type lotteryTable,
  type prizeTable,
} from "#db/internal/db.schema";

export type LotteryRow = InferSelectModel<typeof lotteryTable>;
export type PrizeRow = InferSelectModel<typeof prizeTable>;
export type DrawRow = InferSelectModel<typeof drawTable>;

export type DrawOutcome = (typeof DRAW_OUTCOMES)[number];

export type DrawResult =
  | { outcome: "loss"; prize: null }
  | {
      outcome: "win";
      prize: { id: string; rarity: Rarity; winDescription: string };
    };
