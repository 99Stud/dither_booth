import { RARITY_TYPES } from "@dither-booth/shared/lottery";
import { PHOTO_RECEIPT_TEMPLATES } from "@dither-booth/shared/routes";
import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import {
  check,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

import {
  DEFAULT_RECEIPT_TEMPLATE,
  PRINT_CONFIG_SINGLETON_ID,
} from "./db.constants";

const PHOTO_RECEIPT_TEMPLATE_CHECK_VALUES = PHOTO_RECEIPT_TEMPLATES.map(
  (template) => `'${template}'`,
).join(", ");

export const printConfigTable = sqliteTable(
  "print_config",
  {
    id: integer("id").primaryKey().notNull().default(PRINT_CONFIG_SINGLETON_ID),
    ditherModeCode: integer("dither_mode_code").notNull().default(1),
    colorSchemeCode: integer("color_scheme_code").notNull().default(0),
    serpentine: integer("serpentine", { mode: "boolean" })
      .notNull()
      .default(true),
    exposure: real("exposure").notNull().default(1),
    saturation: real("saturation").notNull().default(1),
    shadows: real("shadows").notNull().default(0),
    highlights: real("highlights").notNull().default(0),
    threshold: real("threshold").notNull().default(128),
    template: text("template", { enum: PHOTO_RECEIPT_TEMPLATES })
      .notNull()
      .default(DEFAULT_RECEIPT_TEMPLATE),
  },
  (table) => [
    check("print_config_singleton_check", sql`${table.id} = 1`),
    check(
      "print_config_dither_mode_code_check",
      sql`${table.ditherModeCode} between 0 and 8`,
    ),
    check(
      "print_config_color_scheme_code_check",
      sql`${table.colorSchemeCode} in (0, 5, 6, 7)`,
    ),
    check("print_config_serpentine_check", sql`${table.serpentine} in (0, 1)`),
    check(
      "print_config_exposure_check",
      sql`${table.exposure} > 0 and ${table.exposure} <= 4`,
    ),
    check(
      "print_config_saturation_check",
      sql`${table.saturation} between 0 and 4`,
    ),
    check("print_config_shadows_check", sql`${table.shadows} between 0 and 1`),
    check(
      "print_config_highlights_check",
      sql`${table.highlights} between 0 and 1`,
    ),
    check(
      "print_config_threshold_check",
      sql`${table.threshold} between 0 and 255`,
    ),
    check(
      "print_config_template_check",
      sql`${table.template} in (${sql.raw(PHOTO_RECEIPT_TEMPLATE_CHECK_VALUES)})`,
    ),
  ],
);

export const campaignTable = sqliteTable("campaign", {
  id: text()
    .primaryKey()
    .notNull()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  lotteryId: text("lottery_id").references(() => lotteryTable.id),
});

export const lotteryTable = sqliteTable(
  "lottery",
  {
    id: text()
      .primaryKey()
      .notNull()
      .$defaultFn(() => createId()),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    noWinWeight: real("no_win_weight").notNull().default(1),
    winCooldownMinutes: integer("win_cooldown_minutes").notNull().default(5),
    printLoserTicket: integer("print_loser_ticket", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [
    check("lottery_no_win_weight_check", sql`${table.noWinWeight} >= 0`),
    check(
      "lottery_win_cooldown_minutes_check",
      sql`${table.winCooldownMinutes} >= 0`,
    ),
    check(
      "lottery_print_loser_ticket_check",
      sql`${table.printLoserTicket} in (0, 1)`,
    ),
  ],
);

export const prizeTable = sqliteTable(
  "prize",
  {
    id: text()
      .primaryKey()
      .notNull()
      .$defaultFn(() => createId()),
    lotteryId: text("lottery_id")
      .notNull()
      .references(() => lotteryTable.id),
    title: text("title").notNull(),
    winInstruction: text("win_instruction").notNull(),
    weight: real("weight").notNull().default(1),
    totalQuantity: integer("total_quantity").notNull().default(0),
    remainingQuantity: integer("remaining_quantity").notNull().default(0),
    rarity: text("rarity", { enum: RARITY_TYPES }).notNull().default("common"),
  },
  (table) => [
    check("prize_weight_check", sql`${table.weight} > 0`),
    check("prize_total_quantity_check", sql`${table.totalQuantity} >= 0`),
    check(
      "prize_remaining_quantity_check",
      sql`${table.remainingQuantity} between 0 and ${table.totalQuantity}`,
    ),
  ],
);

export const drawTable = sqliteTable("draw", {
  id: text()
    .primaryKey()
    .notNull()
    .$defaultFn(() => createId()),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  lotteryId: text("lottery_id").references(() => lotteryTable.id),
  prizeId: text("prize_id").references(() => prizeTable.id),
});
