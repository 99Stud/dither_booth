import type {
  lotteryConfigTable,
  lotteryEventTable,
  lotteryLotTable,
  lotteryPresetTable,
} from "./lottery.schema";
import type { InferSelectModel } from "drizzle-orm";

export type LotteryConfigRow = InferSelectModel<typeof lotteryConfigTable>;
export type LotteryLotRow = InferSelectModel<typeof lotteryLotTable>;
export type LotteryEventRow = InferSelectModel<typeof lotteryEventTable>;
export type LotteryPresetRow = InferSelectModel<typeof lotteryPresetTable>;
