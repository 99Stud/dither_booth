import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { resolve } from "node:path";

import { db, sqlite } from "#db/index";
import { ENGINE_APP_ROOT } from "#lib/constants";

import { ENGINE_DB_MIGRATE_LOG_SOURCE } from "./db.constants";
import { runSqliteMigrations } from "./db.migrations";
import { ensureDefaultPrintConfiguration } from "./db.seed";

const migrationsFolder = resolve(ENGINE_APP_ROOT, "drizzle");

export const applySqliteMigrations = () => {
  const violations = runSqliteMigrations({ db, migrationsFolder, sqlite });

  if (violations.length > 0) {
    logKioskEvent(
      "warn",
      ENGINE_DB_MIGRATE_LOG_SOURCE,
      "sqlite-foreign-key-violations",
      { details: { count: violations.length, violations } },
    );
  }
};

const runMigrateCli = async () => {
  try {
    applySqliteMigrations();
    await ensureDefaultPrintConfiguration();
    logKioskEvent(
      "info",
      ENGINE_DB_MIGRATE_LOG_SOURCE,
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
      ENGINE_DB_MIGRATE_LOG_SOURCE,
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
