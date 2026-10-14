import type { Database } from "bun:sqlite";

import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import type { DB } from "./db.types";

export type ForeignKeyViolation = {
  table: string;
  rowid: number | null;
  parent: string;
  fkid: number;
};

/**
 * Drizzle wraps every pending migration in one transaction, and SQLite ignores
 * `PRAGMA foreign_keys` inside a transaction. The table rebuilds in `drizzle/`
 * (drop + rename) are only safe with enforcement off, so it is switched off
 * around the whole run and back on afterwards.
 *
 * Returns the rows that violate a foreign key after migrating. They are left
 * in place so a booth with legacy orphans still boots.
 */
export const runSqliteMigrations = ({
  db,
  migrationsFolder,
  sqlite,
}: {
  db: DB;
  migrationsFolder: string;
  sqlite: Database;
}): ForeignKeyViolation[] => {
  sqlite.run("PRAGMA foreign_keys = OFF");

  try {
    migrate(db, { migrationsFolder });

    return sqlite
      .query<ForeignKeyViolation, []>("PRAGMA foreign_key_check")
      .all();
  } finally {
    sqlite.run("PRAGMA foreign_keys = ON");
  }
};
