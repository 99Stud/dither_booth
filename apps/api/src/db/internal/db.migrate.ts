import { db, sqlite } from "#db/index.ts";
import { logKioskEvent } from "@dither-booth/logging";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { resolve } from "node:path";

import { API_DB_MIGRATE_LOG_SOURCE } from "./db.constants";

const migrationsFolder = resolve(process.cwd(), "drizzle");
migrate(db, { migrationsFolder });
sqlite.close();
logKioskEvent("info", API_DB_MIGRATE_LOG_SOURCE, "sqlite-migrations-applied", {
  details: {
    migrationsFolder,
  },
});
