import { resolve } from "node:path";

import { ENGINE_APP_ROOT } from "#lib/constants";

export const ENGINE_DB_MIGRATE_LOG_SOURCE = "engine.db.migrate";
export const ENGINE_DB_FILE_PATH = resolve(
  ENGINE_APP_ROOT,
  "data/dither-booth.sqlite",
);

export const PRINT_CONFIG_SINGLETON_ID = 1;
