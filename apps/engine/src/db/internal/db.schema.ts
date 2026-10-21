import { RARITY_TYPES } from "@dither-booth/shared/lottery";
import { DEFAULT_TICKET_ITEM_NAMES } from "@dither-booth/shared/ticket";
import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { PRINT_CONFIG_SINGLETON_ID } from "./db.constants";

export const printConfigTable = sqliteTable(
  "print_config",
  {
    id: integer("id").primaryKey().notNull().default(PRINT_CONFIG_SINGLETON_ID),
    ditherModeCode: integer("dither_mode_code").notNull().default(10),
    colorSchemeCode: integer("color_scheme_code").notNull().default(0),
    serpentine: integer("serpentine", { mode: "boolean" })
      .notNull()
      .default(true),
    exposure: real("exposure").notNull().default(1),
    saturation: real("saturation").notNull().default(1),
    shadows: real("shadows").notNull().default(0),
    highlights: real("highlights").notNull().default(0),
    toneGamma: real("tone_gamma").notNull().default(1.8),
    threshold: integer("threshold").notNull().default(128),
    rotation: integer("rotation").notNull().default(0),
  },
  (table) => [
    check("print_config_singleton_check", sql`${table.id} = 1`),
    check(
      "print_config_dither_mode_code_check",
      sql`${table.ditherModeCode} between 0 and 10`,
    ),
    check(
      "print_config_color_scheme_code_check",
      sql`${table.colorSchemeCode} in (0, 5, 6, 9)`,
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
      "print_config_tone_gamma_check",
      sql`${table.toneGamma} between 1 and 3`,
    ),
    check(
      "print_config_threshold_check",
      sql`${table.threshold} between 0 and 255`,
    ),
    check(
      "print_config_rotation_check",
      sql`${table.rotation} between 0 and 360`,
    ),
  ],
);

export const CAMPAIGN_STATUSES = ["active", "archived"] as const;

const CAMPAIGN_STATUS_CHECK_VALUES = CAMPAIGN_STATUSES.map(
  (status) => `'${status}'`,
).join(", ");

/**
 * One row per event. Replacing the event archives the old row instead of
 * deleting it, so its lottery, prizes and draws stay on record. At most one
 * row is `active`, and everything the booth reads or draws goes through it.
 */
export const campaignTable = sqliteTable(
  "campaign",
  {
    id: text()
      .primaryKey()
      .notNull()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    lotteryId: text("lottery_id").references(() => lotteryTable.id),
    ticketItemNames: text("ticket_item_names", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([...DEFAULT_TICKET_ITEM_NAMES]),
    /**
     * The event's kit, as free text with no CHECK: it is validated in code
     * against the kits this release ships (`resolveKitId`), so a new kit
     * needs no migration. Null means the release's default kit.
     */
    kitId: text("kit_id"),
    /**
     * What the event changes on its kit (`KitSettings`): only the changed
     * keys. Read leniently (`resolveKit`), so a value this release can't use
     * falls back to the kit's default instead of failing the visit.
     */
    kitSettings: text("kit_settings", { mode: "json" })
      .$type<unknown>()
      .notNull()
      .default({}),
    status: text("status", { enum: CAMPAIGN_STATUSES })
      .notNull()
      .default("active"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    /** Last change to anything in the event: campaign, lottery or prizes. */
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    check(
      "campaign_status_check",
      sql`${table.status} in (${sql.raw(CAMPAIGN_STATUS_CHECK_VALUES)})`,
    ),
    uniqueIndex("campaign_single_active_idx")
      .on(table.status)
      .where(sql`${table.status} = 'active'`),
  ],
);

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
    rarity: text("rarity", { enum: RARITY_TYPES }).notNull().default("common"),
    removed: integer("removed", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    check("prize_weight_check", sql`${table.weight} > 0`),
    check("prize_removed_check", sql`${table.removed} in (0, 1)`),
  ],
);

export const drawTable = sqliteTable(
  "draw",
  {
    id: text()
      .primaryKey()
      .notNull()
      .$defaultFn(() => createId()),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    /** The event active when the draw ran; null when there was none. */
    campaignId: text("campaign_id").references(() => campaignTable.id),
    /** The event's lottery, set only when it was enabled for this draw. */
    lotteryId: text("lottery_id").references(() => lotteryTable.id),
    prizeId: text("prize_id").references(() => prizeTable.id),
    // Snapshot taken at draw time so prize edits never rewrite past wins.
    prizeTitle: text("prize_title"),
    ticketRef: text("ticket_ref"),
  },
  (table) => [
    uniqueIndex("draw_ticket_ref_unique").on(table.ticketRef),
    index("draw_prize_id_idx").on(table.prizeId),
    index("draw_campaign_id_idx").on(table.campaignId),
  ],
);

export const STOCK_ADJUSTMENT_REASONS = [
  "initial",
  "restock",
  "correction",
] as const;

const STOCK_ADJUSTMENT_REASON_CHECK_VALUES = STOCK_ADJUSTMENT_REASONS.map(
  (reason) => `'${reason}'`,
).join(", ");

/**
 * Append-only stock ledger. A prize's stock is the sum of its adjustments
 * minus its winning draws; nothing stores a running total. Ids are supplied
 * by whoever requests the change, so a retried delta is applied once.
 * Triggers added in `0011_stock_ledger` keep stock from going negative.
 */
export const stockAdjustmentTable = sqliteTable(
  "stock_adjustment",
  {
    id: text().primaryKey().notNull(),
    prizeId: text("prize_id")
      .notNull()
      .references(() => prizeTable.id),
    delta: integer("delta").notNull(),
    reason: text("reason", { enum: STOCK_ADJUSTMENT_REASONS }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("stock_adjustment_prize_id_idx").on(table.prizeId),
    check("stock_adjustment_delta_check", sql`${table.delta} <> 0`),
    check(
      "stock_adjustment_reason_check",
      sql`${table.reason} in (${sql.raw(STOCK_ADJUSTMENT_REASON_CHECK_VALUES)})`,
    ),
  ],
);

/**
 * Who may open the Darkroom (print tuning on the booth iPad). One row once a
 * PIN is set in admin; no row means the Darkroom stays locked. Only the
 * argon2id hash is stored, never the PIN.
 */
export const darkroomAccessTable = sqliteTable(
  "darkroom_access",
  {
    id: integer("id").primaryKey().notNull().default(1),
    pinHash: text("pin_hash").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [check("darkroom_access_singleton_check", sql`${table.id} = 1`)],
);

/**
 * Whether the booth is in maintenance: the photo booth screen tells guests
 * to come back later. One row once it was first switched; no row means off.
 */
export const kioskMaintenanceTable = sqliteTable(
  "kiosk_maintenance",
  {
    id: integer("id").primaryKey().notNull().default(1),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [check("kiosk_maintenance_singleton_check", sql`${table.id} = 1`)],
);

export const FONT_ASSET_SOURCES = ["fontsource", "upload"] as const;

const FONT_ASSET_SOURCE_CHECK_VALUES = FONT_ASSET_SOURCES.map(
  (source) => `'${source}'`,
).join(", ");

export type FontAssetFile = {
  weight: number;
  style: "normal" | "italic";
  /** Under the engine's font folder: `<asset id>/<weight>-<style>.woff2`. */
  path: string;
};

/**
 * A font added to the booth from admin (Google Fonts through Fontsource, or
 * an uploaded woff2), so a kit role can use it offline. Its files sit on the
 * SSD next to the database.
 */
export const fontAssetTable = sqliteTable(
  "font_asset",
  {
    id: text()
      .primaryKey()
      .notNull()
      .$defaultFn(() => createId()),
    family: text("family").notNull(),
    source: text("source", { enum: FONT_ASSET_SOURCES }).notNull(),
    /** The font's licence as given by its source, or as staff confirmed it. */
    license: text("license").notNull(),
    files: text("files", { mode: "json" }).$type<FontAssetFile[]>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    check(
      "font_asset_source_check",
      sql`${table.source} in (${sql.raw(FONT_ASSET_SOURCE_CHECK_VALUES)})`,
    ),
  ],
);

/**
 * The booth's registration with the Hub, made with a one-time code. One row
 * or none. The refresh token is the booth's only credential on the Hub: it
 * is single use, so every refresh stores the next one here.
 */
export const hubRegistrationTable = sqliteTable(
  "hub_registration",
  {
    id: integer("id").primaryKey().notNull().default(1),
    hubUrl: text("hub_url").notNull(),
    boothId: text("booth_id").notNull(),
    boothName: text("booth_name").notNull(),
    refreshToken: text("refresh_token").notNull(),
    registeredAt: integer("registered_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [check("hub_registration_singleton_check", sql`${table.id} = 1`)],
);

export const dbSchema = {
  printConfigTable,
  campaignTable,
  lotteryTable,
  prizeTable,
  drawTable,
  stockAdjustmentTable,
  darkroomAccessTable,
  kioskMaintenanceTable,
  fontAssetTable,
  hubRegistrationTable,
};
