import {
  EVENT_BACKUP_PREFIX,
  EVENT_BACKUPS_DIR_NAME,
  backupStamp,
} from "@dither-booth/shared/server/database-backup";
import { Database } from "bun:sqlite";
import { readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";

import { ENGINE_DB_FILE } from "#internal/config";

import type { HealthVerdict } from "./update.health";
import type { UpdateLayout } from "./update.layout";

import {
  UpdateRefused,
  type UpdateHost,
  waitHealthy,
  withLock,
} from "./update";
import { backupDatabase, countMigrations, restoreDatabase } from "./update.db";

/*
 * `booth restore`: puts a copy of the database back, one the engine took
 * during an event or one `booth update` took. The database it replaces is
 * copied first, so a restore is undone by restoring that copy.
 */

export type BackupKind = "event" | "update" | "restore";

export type DatabaseBackup = {
  kind: BackupKind;
  name: string;
  path: string;
  /** When it was taken, read from its name. */
  takenAt: Date | null;
  bytes: number;
};

const PREFIXES: Record<BackupKind, string> = {
  event: EVENT_BACKUP_PREFIX,
  update: "update-",
  restore: "restore-",
};

const STAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/;

function readStamp(stamp: string): Date | null {
  const match = STAMP.exec(stamp);
  if (!match) return null;
  const [, day, hours, minutes, seconds, ms] = match;
  return new Date(`${day}T${hours}:${minutes}:${seconds}.${ms}Z`);
}

export const eventBackupsDir = (layout: UpdateLayout) =>
  join(layout.dataDir, EVENT_BACKUPS_DIR_NAME);

export const databasePath = (layout: UpdateLayout) =>
  join(layout.dataDir, ENGINE_DB_FILE);

/** Every backup on the booth, newest first. */
export async function listBackups(
  layout: UpdateLayout,
): Promise<DatabaseBackup[]> {
  const found: (DatabaseBackup & { stamp: string })[] = [];
  const folders: [string, BackupKind[]][] = [
    [eventBackupsDir(layout), ["event"]],
    [layout.backupsDir, ["update", "restore"]],
  ];

  for (const [dir, kinds] of folders) {
    const names = await readdir(dir).catch(() => [] as string[]);

    for (const name of names) {
      const kind = kinds.find((k) => name.startsWith(PREFIXES[k]));
      if (!kind || !name.endsWith(".sqlite")) continue;

      const path = join(dir, name);
      const stamp = name.slice(PREFIXES[kind].length);
      const { size } = await stat(path);
      found.push({
        kind,
        name,
        path,
        stamp,
        takenAt: readStamp(stamp),
        bytes: size,
      });
    }
  }

  return found
    .toSorted((a, b) => b.stamp.localeCompare(a.stamp))
    .map(({ stamp: _, ...backup }) => backup);
}

/** What a backup holds, to tell them apart. Null when it can't be read. */
export function countEventRows(
  path: string,
): { events: number; visits: number; draws: number } | null {
  let db: Database | undefined;

  try {
    db = new Database(path, { readonly: true });
    const count = (table: string) =>
      db!.query<{ n: number }, []>(`SELECT count(*) AS n FROM ${table}`).get()
        ?.n ?? 0;
    return {
      events: count("campaign"),
      visits: count("visit"),
      draws: count("draw"),
    };
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

/** A name from `listBackups`, or a path to a copy brought from elsewhere. */
export async function findBackup(
  layout: UpdateLayout,
  nameOrPath: string,
): Promise<string> {
  const backups = await listBackups(layout);
  const named = backups.find(
    (b) => b.name === nameOrPath || b.name === `${nameOrPath}.sqlite`,
  );
  if (named) return named.path;

  const exists = await stat(nameOrPath).then(
    (s) => s.isFile(),
    () => false,
  );
  if (exists) return nameOrPath;

  throw new UpdateRefused(
    `No backup named ${nameOrPath}. \`sudo booth restore\` lists them.`,
  );
}

export type RestoreOutcome = {
  /** The database that was replaced, copied; null when there was none. */
  replaced: string | null;
  verdict: HealthVerdict;
};

/**
 * Stops the booth, copies the database it ran on, puts `backup` in its
 * place and starts the booth again. Holds the update lock, so it never
 * runs during an update or a rollback.
 */
export async function runRestore({
  layout,
  host,
  backup,
}: {
  layout: UpdateLayout;
  host: UpdateHost;
  backup: string;
}): Promise<RestoreOutcome> {
  const dbPath = databasePath(layout);
  const theirs = countMigrations(backup);

  if (theirs === null) {
    throw new UpdateRefused(`${basename(backup)} isn't a booth database.`);
  }

  const ours = countMigrations(dbPath);

  // Migrations only go forward: this release can't run on a newer one's.
  if (ours !== null && theirs > ours) {
    throw new UpdateRefused(
      `${basename(backup)} was made by a newer release than the one this booth runs.`,
    );
  }

  return withLock(layout, host, async () => {
    await host.stopBooth();
    let replaced: string | null = null;

    try {
      // The engine is stopped: this copy holds everything it wrote.
      if (ours !== null) {
        replaced = await backupDatabase({
          dbPath,
          backupsDir: layout.backupsDir,
          prefix: PREFIXES.restore,
          label: backupStamp(host.now()),
        });
      }
      await restoreDatabase(backup, dbPath);
      await host.chownToServiceUser(dbPath);
    } finally {
      await host.startBooth();
    }

    return { replaced, verdict: await waitHealthy(host, layout) };
  });
}
