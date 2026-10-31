import {
  type BackupKind,
  backupDatabase,
} from "@dither-booth/shared/server/database-backup";
import { Database } from "bun:sqlite";
import { copyFile, rename, rm } from "node:fs/promises";

/*
 * The engine's database around an update or a restore. Migrations only go
 * forward, so the copy taken before the switch is what a rollback restores.
 */

/** Applied migrations, or null when there is no database (yet). */
export function countMigrations(dbPath: string): number | null {
  let db: Database | undefined;

  try {
    db = new Database(dbPath, { readonly: true });
    const row = db
      .query<{ count: number }, []>(
        "SELECT count(*) AS count FROM __drizzle_migrations",
      )
      .get();
    return row?.count ?? null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

/** A consistent copy of the database file, while the engine keeps writing. */
export async function backupDatabaseFile({
  dbPath,
  dir,
  kind,
  label,
}: {
  dbPath: string;
  dir: string;
  kind: BackupKind;
  label: string;
}): Promise<string> {
  const db = new Database(dbPath, { readwrite: true, create: false });

  try {
    return await backupDatabase(db, { dir, kind, label });
  } finally {
    db.close();
  }
}

/** Puts a backup back. The engine must be stopped. */
export async function restoreDatabase(
  backup: string,
  dbPath: string,
): Promise<void> {
  const next = `${dbPath}.restore`;
  await copyFile(backup, next);
  // The old journals belong to the database being replaced.
  for (const journal of ["-wal", "-shm", "-journal"]) {
    await rm(`${dbPath}${journal}`, { force: true });
  }
  await rename(next, dbPath);
}
