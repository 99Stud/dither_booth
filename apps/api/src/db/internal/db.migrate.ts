import { db, sqlite } from "#db/index.ts";
import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { resolve } from "node:path";

import { API_DB_MIGRATE_LOG_SOURCE } from "./db.constants";

const migrationsFolder = resolve(process.cwd(), "drizzle");

try {
  migrate(db, { migrationsFolder });
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
