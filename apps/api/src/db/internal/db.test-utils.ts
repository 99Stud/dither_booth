import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { resolve } from "node:path";

import type { DB } from "./db.types";

import { runSqliteMigrations } from "./db.migrations";
import { dbSchema } from "./db.schema";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../drizzle");

/** Fresh in-memory database with every migration applied and FKs enforced. */
export function createTestDb(): { db: DB; sqlite: Database } {
  const sqlite = new Database(":memory:");
  const db = drizzle({ client: sqlite, schema: dbSchema });

  runSqliteMigrations({ db, migrationsFolder: MIGRATIONS_FOLDER, sqlite });

  return { db, sqlite };
}
