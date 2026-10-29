import { Database } from "bun:sqlite";
import { copyFile, mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

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
 * A consistent copy while the engine keeps writing: `VACUUM INTO` reads
 * one snapshot. Returns the copy's path.
 */
export async function backupDatabase({
  dbPath,
  backupsDir,
  label,
}: {
  dbPath: string;
  backupsDir: string;
  label: string;
}): Promise<string> {
  await mkdir(backupsDir, { recursive: true });

  const dest = join(backupsDir, `${BACKUP_PREFIX}${label}.sqlite`);
  const db = new Database(dbPath, { readwrite: true, create: false });

  try {
    await rm(dest, { force: true });
    db.run("VACUUM INTO ?", [dest]);
  } finally {
    db.close();
  }

  const backups = (await readdir(backupsDir))
    .filter((name) => name.startsWith(BACKUP_PREFIX))
    .toSorted()
    .toReversed();

  for (const old of backups.slice(UPDATE_BACKUPS_KEPT)) {
    await rm(join(backupsDir, old), { force: true });
  }

  return dest;
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
