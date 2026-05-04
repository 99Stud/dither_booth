import { API_APP_ROOT } from "#lib/constants";
import { resolve } from "node:path";

export const API_DB_MIGRATE_LOG_SOURCE = "api.db.migrate";
export const API_DB_FILE_PATH = resolve(
  API_APP_ROOT,
  "data/dither-booth.sqlite",
);

export const PRINT_CONFIG_SINGLETON_ID = 1;
