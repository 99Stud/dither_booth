import { sql } from "drizzle-orm";
import { check, integer, real, sqliteTable } from "drizzle-orm/sqlite-core";

export const PRINT_CONFIG_SINGLETON_ID = 1 as const;

const DEFAULT_DITHER_MODE_CODE = 2;
const DEFAULT_BRIGHTNESS = 1;
const DEFAULT_CONTRAST = 1;
const DEFAULT_GAMMA = 1;
const DEFAULT_THRESHOLD = 128;

export const printConfigTable = sqliteTable(
  "print_debug_config",
  {
    id: integer("id").primaryKey().notNull().default(PRINT_CONFIG_SINGLETON_ID),
    ditherModeCode: integer("dither_mode_code")
      .notNull()
      .default(DEFAULT_DITHER_MODE_CODE),
    brightness: real("brightness").notNull().default(DEFAULT_BRIGHTNESS),
    contrast: real("contrast").notNull().default(DEFAULT_CONTRAST),
    gamma: real("gamma").notNull().default(DEFAULT_GAMMA),
    threshold: real("threshold").notNull().default(DEFAULT_THRESHOLD),
  },
  (table) => [
    check("print_debug_config_singleton_check", sql`${table.id} = 1`),
    check(
      "print_debug_config_dither_mode_code_check",
      sql`${table.ditherModeCode} between 0 and 8`,
    ),
    check(
      "print_debug_config_brightness_step_check",
      sql`${table.brightness} between 0 and 3`,
    ),
    check(
      "print_debug_config_contrast_step_check",
      sql`${table.contrast} between 0 and 3`,
    ),
    check(
      "print_debug_config_gamma_step_check",
      sql`${table.gamma} between 1 and 3`,
    ),
    check(
      "print_debug_config_threshold_check",
      sql`${table.threshold} between 0 and 255`,
    ),
  ],
);
