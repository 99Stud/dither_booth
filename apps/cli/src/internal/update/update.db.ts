import { backupDatabase as backupInto } from "@dither-booth/shared/server/database-backup";
import { Database } from "bun:sqlite";
import { copyFile, rename, rm } from "node:fs/promises";

/*
 * The engine's database around an update. Migrations only go forward, so
 * the copy taken before the switch is what a rollback restores.
 */

/** Update backups kept on the SSD; older ones are deleted. */
export const UPDATE_BACKUPS_KEPT = 3;
const BACKUP_PREFIX = "update-";

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

/**
 * A consistent copy while the engine keeps writing. Returns the copy's
 * path. `booth restore` keeps its own, as many, under its prefix.
 */
export async function backupDatabase({
  dbPath,
  backupsDir,
  label,
  prefix = BACKUP_PREFIX,
}: {
  dbPath: string;
  backupsDir: string;
  label: string;
  prefix?: string;
}): Promise<string> {
  const db = new Database(dbPath, { readwrite: true, create: false });

  try {
    return await backupInto(db, {
      dir: backupsDir,
      prefix,
      label,
      keep: UPDATE_BACKUPS_KEPT,
    });
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
  // The old journal belongs to the database being replaced.
  await rm(`${dbPath}-wal`, { force: true });
  await rm(`${dbPath}-shm`, { force: true });
  await rename(next, dbPath);
}
