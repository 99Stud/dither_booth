import type { Database } from "bun:sqlite";

import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

import type { DB } from "./db.types";

export type ForeignKeyViolation = {
  table: string;
  rowid: number | null;
  parent: string;
  fkid: number;
};

/**
 * drizzle-orm 0.x recorded each migration as a hash and its journal time in
 * milliseconds, and skipped rows it did not know. v1 names every row after
 * its migration folder the first time it runs, matching by second or by
 * hash, and refuses to start while any row matches no folder. A database
 * that ran a migration later regenerated or never merged holds such rows.
 * They move to `__drizzle_migrations_retired` before drizzle reads the table.
 */
const retireUnknownV0Migrations = (
  sqlite: Database,
  migrationsFolder: string,
) => {
  const columns = sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM pragma_table_info('__drizzle_migrations')",
    )
    .all()
    .map((column) => column.name);
  if (columns.length === 0 || columns.includes("name")) return;

  const local = readMigrationFiles({ migrationsFolder });
  // Drizzle's own rule: the one folder of the same second, else the hash
  // among the folders of that second, else the hash among all of them.
  const matchesAFolder = (row: { hash: string; created_at: number }) => {
    const second = Math.floor(Number(row.created_at) / 1000) * 1000;
    const sameSecond = local.filter(
      (migration) => migration.folderMillis === second,
    );
    const candidates = sameSecond.length > 0 ? sameSecond : local;
    return (
      sameSecond.length === 1 ||
      candidates.some((migration) => migration.hash === row.hash)
    );
  };
  const unknown = sqlite
    .query<{ rowid: number; hash: string; created_at: number }, []>(
      "SELECT rowid, hash, created_at FROM __drizzle_migrations",
    )
    .all()
    .filter((row) => !matchesAFolder(row));
  if (unknown.length === 0) return;

  sqlite.transaction(() => {
    sqlite.run(
      "CREATE TABLE IF NOT EXISTS __drizzle_migrations_retired AS SELECT * FROM __drizzle_migrations WHERE 0",
    );
    for (const { rowid } of unknown) {
      sqlite.run(
        "INSERT INTO __drizzle_migrations_retired SELECT * FROM __drizzle_migrations WHERE rowid = ?",
        [rowid],
      );
      sqlite.run("DELETE FROM __drizzle_migrations WHERE rowid = ?", [rowid]);
    }
  })();
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
    retireUnknownV0Migrations(sqlite, migrationsFolder);
    migrate(db, { migrationsFolder });

    return sqlite
      .query<ForeignKeyViolation, []>("PRAGMA foreign_key_check")
      .all();
  } finally {
    sqlite.run("PRAGMA foreign_keys = ON");
  }
};
