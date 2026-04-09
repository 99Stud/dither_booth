import { sql } from "drizzle-orm";
import { check, integer, real, sqliteTable } from "drizzle-orm/sqlite-core";

import { PRINT_CONFIG_SINGLETON_ID } from "./db.constants";

export const printConfigTable = sqliteTable(
  "print_debug_config",
  {
    id: integer("id").primaryKey().notNull().default(PRINT_CONFIG_SINGLETON_ID),
    ditherModeCode: integer("dither_mode_code").notNull().default(2),
    brightness: real("brightness").notNull().default(1),
    contrast: real("contrast").notNull().default(1),
    gamma: real("gamma").notNull().default(1),
    threshold: real("threshold").notNull().default(128),
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
