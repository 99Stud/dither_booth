import type {
  DrawOutcome,
  DrawResult,
  LotteryStatus,
  LotteryStatusRarityBreakdown,
} from "@dither-booth/shared/lottery";
import type { InferSelectModel } from "drizzle-orm";

import type {
  drawTable,
  lotteryTable,
  prizeTable,
} from "#db/internal/db.schema";

export type LotteryRow = InferSelectModel<typeof lotteryTable>;
export type PrizeRow = InferSelectModel<typeof prizeTable>;
export type DrawRow = InferSelectModel<typeof drawTable>;

export type {
  DrawOutcome,
  DrawResult,
  LotteryStatus,
  LotteryStatusRarityBreakdown,
};
