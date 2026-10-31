import {
  type BackupKind,
  EVENT_BACKUPS_DIR_NAME,
  backupStamp,
  listBackupFiles,
} from "@dither-booth/shared/server/database-backup";
import { Database } from "bun:sqlite";
import { copyFile, mkdir, rm, stat } from "node:fs/promises";
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
import {
  backupDatabaseFile,
  countMigrations,
  restoreDatabase,
} from "./update.db";

/*
 * `booth backup` and `booth restore`: a copy of the database by hand, and
 * one put back, from the engine's backups during an event or the CLI's
 * own. They live with the update jobs because they share the booth's
 * layout, its lock and its health check. The database a restore replaces
 * is copied first, so a restore is undone by restoring that copy.
 */

/** Where each kind of backup is, in the order `booth restore` lists them. */
export type BackupFolder = {
  title: string;
  dir: string;
  kind: BackupKind;
};

export type DatabaseBackup = {
  folder: BackupFolder;
  name: string;
  path: string;
  /** By the booth's clock, which can be off after a power cut. */
  takenAt: Date | null;
  bytes: number;
};

export const databasePath = (layout: UpdateLayout) =>
  join(layout.dataDir, ENGINE_DB_FILE);

export function backupFolders(layout: UpdateLayout): BackupFolder[] {
  return [
    {
      title: "During the event (SSD)",
      dir: join(layout.dataDir, EVENT_BACKUPS_DIR_NAME),
      kind: "event",
    },
    {
      title: "During the event, newest (SD card)",
      dir: join(layout.repoLink, ".local", EVENT_BACKUPS_DIR_NAME),
      kind: "event",
    },
    { title: "By hand", dir: layout.backupsDir, kind: "manual" },
    { title: "Replaced by a restore", dir: layout.backupsDir, kind: "restore" },
    { title: "Before an update", dir: layout.backupsDir, kind: "update" },
  ];
}

/** Every backup on the booth, by folder, newest first in each. */
export async function listBackups(
  layout: UpdateLayout,
): Promise<DatabaseBackup[]> {
  const backups: DatabaseBackup[] = [];

  for (const folder of backupFolders(layout)) {
    for (const { name, takenAt } of await listBackupFiles(
      folder.dir,
      folder.kind,
    )) {
      const path = join(folder.dir, name);
      const { size } = await stat(path);
      backups.push({ folder, name, path, takenAt, bytes: size });
    }
  }

  return backups;
}

export type EventRows = { events: number; visits: number; draws: number };

/** What a backup holds, to tell them apart. Null when it can't be read. */
export function countEventRows(path: string): EventRows | null {
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

/**
 * A name from `listBackups` (the first folder holding it: the SSD before
 * the SD card), or a path to a copy brought from elsewhere.
 */
export async function findBackup(
  layout: UpdateLayout,
  nameOrPath: string,
): Promise<string> {
  const named = (await listBackups(layout)).find(
    (b) => b.name === nameOrPath || b.name === `${nameOrPath}.sqlite`,
  );
  if (named) return named.path;

  const isFile = await stat(nameOrPath).then(
    (s) => s.isFile(),
    () => false,
  );
  if (isFile) return nameOrPath;

  throw new UpdateRefused(
    `No backup named ${nameOrPath}. \`booth restore\` lists them.`,
  );
}

/** `sudo booth backup`: a copy now, with the booth running. */
export async function runBackup({
  layout,
  host,
}: {
  layout: UpdateLayout;
  host: UpdateHost;
}): Promise<string> {
  const dbPath = databasePath(layout);

  if (countMigrations(dbPath) === null) {
    throw new UpdateRefused(`No booth database at ${dbPath}.`);
  }

  return backupDatabaseFile({
    dbPath,
    dir: layout.backupsDir,
    kind: "manual",
    label: backupStamp(host.now()),
  });
}

export type RestoreOutcome = {
  /** The database that was replaced, copied; null when there was none. */
  replaced: string | null;
  verdict: HealthVerdict;
};

/**
 * A database SQLite can't open is copied as it is, with its journals, so
 * nothing in it is lost. Null when there is none.
 */
async function copyDamaged(
  layout: UpdateLayout,
  host: UpdateHost,
  dbPath: string,
): Promise<string | null> {
  const isFile = await stat(dbPath).then(
    (s) => s.isFile(),
    () => false,
  );
  if (!isFile) return null;

  await mkdir(layout.backupsDir, { recursive: true });
  const copy = join(
    layout.backupsDir,
    `restore-damaged-${backupStamp(host.now())}.sqlite`,
  );

  for (const suffix of ["", "-journal", "-wal"]) {
    await copyFile(`${dbPath}${suffix}`, `${copy}${suffix}`).catch(
      (error: NodeJS.ErrnoException) => {
        if (suffix === "" || error.code !== "ENOENT") throw error;
      },
    );
  }

  return copy;
}

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
  const backupMigrations = countMigrations(backup);

  if (backupMigrations === null) {
    throw new UpdateRefused(`${basename(backup)} isn't a booth database.`);
  }

  const currentMigrations = countMigrations(dbPath);

  // Migrations only go forward: this release can't run on a newer one's.
  if (currentMigrations !== null && backupMigrations > currentMigrations) {
    throw new UpdateRefused(
      `${basename(backup)} was made by a newer release than the one this booth runs.`,
    );
  }

  return withLock(layout, host, async () => {
    // Set aside first: the engine's backup at stop, and the copy of the
    // database replaced, each prune the oldest of their kind, which can be
    // the one being restored.
    const staged = `${dbPath}.staged`;
    await copyFile(backup, staged);
    let replaced: string | null = null;

    try {
      await host.stopBooth();

      try {
        // The engine is stopped: this copy holds everything it wrote.
        replaced =
          currentMigrations === null
            ? await copyDamaged(layout, host, dbPath)
            : await backupDatabaseFile({
                dbPath,
                dir: layout.backupsDir,
                kind: "restore",
                label: backupStamp(host.now()),
              });
        await restoreDatabase(staged, dbPath);
        await host.chownToServiceUser(dbPath);
      } finally {
        await host.startBooth();
      }
    } finally {
      await rm(staged, { force: true });
    }

    return { replaced, verdict: await waitHealthy(host, layout) };
  });
}
