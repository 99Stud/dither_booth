import type { Database } from "bun:sqlite";

import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

/*
 * Copies of the engine's database: the one `booth update` takes before its
 * switch, and the ones the engine takes during an event. Each kind has its
 * prefix and keeps only its newest files, so one never prunes the other.
 */

/** The engine's own backups, in this folder of its data folder (the SSD). */
export const EVENT_BACKUPS_DIR_NAME = "backups";
export const EVENT_BACKUP_PREFIX = "event-";
/** A day of backups taken every 5 minutes, about 150 KB each. */
export const EVENT_BACKUPS_KEPT = 288;

/** An ISO time a file name can hold (`2026-10-31T19-05-00-000Z`), sorting in time order. */
export const backupStamp = (date: Date) =>
  date.toISOString().replaceAll(/[:.]/g, "-");

/**
 * A consistent copy while the engine keeps writing: `VACUUM INTO` reads
 * one snapshot. Then only the newest `keep` files of `prefix` stay.
 * Returns the copy's path.
 */
export async function backupDatabase(
  db: Database,
  {
    dir,
    prefix,
    label,
    keep,
  }: { dir: string; prefix: string; label: string; keep: number },
): Promise<string> {
  await mkdir(dir, { recursive: true });

  const dest = join(dir, `${prefix}${label}.sqlite`);
  await rm(dest, { force: true });
  db.run("VACUUM INTO ?", [dest]);

  const backups = (await readdir(dir))
    .filter((name) => name.startsWith(prefix) && name.endsWith(".sqlite"))
    .toSorted()
    .toReversed();

  for (const old of backups.slice(keep)) {
    await rm(join(dir, old), { force: true });
  }

  return dest;
}
