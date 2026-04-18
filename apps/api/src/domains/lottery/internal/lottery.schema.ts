import { sql } from "drizzle-orm";
import {
  check,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

import { LOTTERY_CONFIG_SINGLETON_ID } from "./lottery.constants";

export const lotteryPresetTable = sqliteTable("lottery_preset", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  linesJson: text("lines_json").notNull(),
});

export const lotteryConfigTable = sqliteTable(
  "lottery_config",
  {
    id: integer("id")
      .primaryKey()
      .notNull()
      .default(LOTTERY_CONFIG_SINGLETON_ID),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    startTime: text("start_time").notNull().default("16:00"),
    endTime: text("end_time").notNull().default("21:00"),
    baseWinPressure: real("base_win_pressure").notNull().default(0.15),
    maxBoost: real("max_boost").notNull().default(3),
    abuseWindowSeconds: integer("abuse_window_seconds").notNull().default(60),
    abuseMaxAttempts: integer("abuse_max_attempts").notNull().default(5),
    abuseMinIntervalSeconds: integer("abuse_min_interval_seconds")
      .notNull()
      .default(10),
    abuseCooldownSeconds: integer("abuse_cooldown_seconds")
      .notNull()
      .default(120),
  },
  (table) => [
    check("lottery_config_singleton_check", sql`${table.id} = 1`),
    check(
      "lottery_config_base_win_pressure_check",
      sql`${table.baseWinPressure} between 0 and 1`,
    ),
    check(
      "lottery_config_max_boost_check",
      sql`${table.maxBoost} between 1 and 10`,
    ),
  ],
);

export const lotteryLotTable = sqliteTable(
  "lottery_lot",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    label: text("label").notNull(),
    stockTotal: integer("stock_total").notNull(),
    stockRemaining: integer("stock_remaining").notNull(),
    baseWeight: real("base_weight").notNull().default(1),
    rarity: text("rarity").notNull().default("common"),
    /** Optional copy shown on the printed ticket (e.g. prize details). */
    description: text("description"),
    /** Shown after a win (e.g. where to redeem). Empty/null uses default kiosk copy. */
    instructions: text("instructions"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    check(
      "lottery_lot_stock_remaining_check",
      sql`${table.stockRemaining} >= 0`,
    ),
    check(
      "lottery_lot_stock_total_check",
      sql`${table.stockTotal} >= 1`,
    ),
    check(
      "lottery_lot_base_weight_check",
      sql`${table.baseWeight} > 0`,
    ),
  ],
);

export const lotteryEventTable = sqliteTable("lottery_event", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  timestamp: text("timestamp")
    .notNull()
    .default(sql`(datetime('now'))`),
  outcome: text("outcome").notNull(),
  lotId: integer("lot_id").references(() => lotteryLotTable.id),
  abuseDetected: integer("abuse_detected", { mode: "boolean" })
    .notNull()
    .default(false),
  computedPressure: real("computed_pressure"),
  computedWinProbability: real("computed_win_probability"),
  remainingStock: integer("remaining_stock"),
  elapsedWindowRatio: real("elapsed_window_ratio"),
  captureToDrawMs: integer("capture_to_draw_ms"),
});
