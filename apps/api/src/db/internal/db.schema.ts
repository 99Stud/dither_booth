import { sql } from "drizzle-orm";
import { check, integer, real, sqliteTable } from "drizzle-orm/sqlite-core";

import { PRINT_CONFIG_SINGLETON_ID } from "./db.constants";

export const printConfigTable = sqliteTable(
  "print_debug_config",
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
  },
  (table) => [
    check("print_debug_config_singleton_check", sql`${table.id} = 1`),
    check(
      "print_debug_config_dither_mode_code_check",
      sql`${table.ditherModeCode} between 0 and 8`,
    ),
    check(
      "print_debug_config_color_scheme_code_check",
      sql`${table.colorSchemeCode} in (0, 5, 6, 7)`,
    ),
    check(
      "print_debug_config_serpentine_check",
      sql`${table.serpentine} in (0, 1)`,
    ),
    check(
      "print_debug_config_exposure_check",
      sql`${table.exposure} > 0 and ${table.exposure} <= 4`,
    ),
    check(
      "print_debug_config_saturation_check",
      sql`${table.saturation} between 0 and 4`,
    ),
    check(
      "print_debug_config_shadows_check",
      sql`${table.shadows} between 0 and 1`,
    ),
    check(
      "print_debug_config_highlights_check",
      sql`${table.highlights} between 0 and 1`,
    ),
    check(
      "print_debug_config_threshold_check",
      sql`${table.threshold} between 0 and 255`,
    ),
  ],
);
