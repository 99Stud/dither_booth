import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { resolve } from "node:path";

import { db, sqlite } from "#db/index";
import { API_APP_ROOT } from "#lib/constants";

import { API_DB_MIGRATE_LOG_SOURCE } from "./db.constants";
import { ensureDefaultPrintConfiguration } from "./db.seed";

const migrationsFolder = resolve(API_APP_ROOT, "drizzle");

export const applySqliteMigrations = () => {
  migrate(db, { migrationsFolder });
};

const runMigrateCli = async () => {
  try {
    applySqliteMigrations();
    await ensureDefaultPrintConfiguration();
    logKioskEvent(
      "info",
      API_DB_MIGRATE_LOG_SOURCE,
      "sqlite-migrations-applied",
      {
        details: {
          migrationsFolder,
        },
      },
    );
  } catch (error) {
    logKioskEvent(
      "error",
      API_DB_MIGRATE_LOG_SOURCE,
      "sqlite-migrations-failed",
      {
        details: {
          migrationsFolder,
        },
        error: getKioskErrorDiagnostics(error, "SQLite migrations failed."),
      },
    );
    throw error;
  } finally {
    sqlite.close();
  }
};

if (import.meta.main) {
  await runMigrateCli();
}
