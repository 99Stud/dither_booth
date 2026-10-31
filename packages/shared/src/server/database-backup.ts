import type { Database } from "bun:sqlite";

import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

/*
 * Copies of the engine's database. Each kind has its prefix and keeps only
 * its newest files, so one never prunes another. A file is named
 * `<prefix><sequence>-<label>.sqlite`: the sequence, not the clock, orders
 * them, because a Pi without internet can boot an hour behind after a
 * power cut.
 */

export const BACKUP_KINDS = {
  /** The engine's, while it runs: a day at one every 5 minutes. */
  event: { prefix: "event-", keep: 288 },
  /** `booth update`'s, before its switch. */
  update: { prefix: "update-", keep: 3 },
  /** The database each `booth restore` replaced. */
  restore: { prefix: "restore-", keep: 3 },
  /** `sudo booth backup`, by hand. */
  manual: { prefix: "manual-", keep: 10 },
} as const;

export type BackupKind = keyof typeof BACKUP_KINDS;

/** The engine's own backups, in this folder of its data folder (the SSD). */
export const EVENT_BACKUPS_DIR_NAME = "backups";
/** The newest event backups, copied to the SD card as well. */
export const EVENT_BACKUPS_MIRRORED = 12;

const BACKUP_FILE = /^(\d{8})-(.*)\.sqlite$/;
const BACKUP_STAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/;

/** An ISO time a file name can hold (`2026-10-31T19-05-00-000Z`). */
export const backupStamp = (date: Date) =>
  date.toISOString().replaceAll(/[:.]/g, "-");

export type BackupName = {
  kind: BackupKind;
  /** Orders a kind's backups; 0 for one named before sequences. */
  sequence: number;
  /** When it was taken by the booth's clock, read from its name. */
  takenAt: Date | null;
};

/** What a backup's file name says, or null for any other file. */
export function parseBackupName(name: string): BackupName | null {
  for (const [kind, { prefix }] of Object.entries(BACKUP_KINDS)) {
    if (!name.startsWith(prefix) || !name.endsWith(".sqlite")) continue;

    const rest = name.slice(prefix.length);
    const numbered = BACKUP_FILE.exec(rest);
    const label = numbered ? numbered[2]! : rest;
    const stamp = BACKUP_STAMP.exec(label);

    return {
      kind: kind as BackupKind,
      sequence: numbered ? Number(numbered[1]) : 0,
      takenAt: stamp
        ? new Date(
            `${stamp[1]}T${stamp[2]}:${stamp[3]}:${stamp[4]}.${stamp[5]}Z`,
          )
        : null,
    };
  }

  return null;
}

/** A folder's backups of one kind, newest first. */
export async function listBackupFiles(
  dir: string,
  kind: BackupKind,
): Promise<(BackupName & { name: string })[]> {
  const names = await readdir(dir).catch(() => [] as string[]);

  return names
    .flatMap((name) => {
      const parsed = parseBackupName(name);
      return parsed?.kind === kind ? [{ ...parsed, name }] : [];
    })
    .toSorted(
      (a, b) => b.sequence - a.sequence || b.name.localeCompare(a.name),
    );
}

/**
 * A consistent copy while the engine keeps writing: `VACUUM INTO` reads
 * one snapshot. Then only the newest of its kind stay (`keep`, or the
 * kind's). Returns the copy's path.
 */
export async function backupDatabase(
  db: Database,
  {
    dir,
    kind,
    label,
    keep = BACKUP_KINDS[kind].keep,
  }: { dir: string; kind: BackupKind; label: string; keep?: number },
): Promise<string> {
  await mkdir(dir, { recursive: true });

  const { prefix } = BACKUP_KINDS[kind];
  const sequence = ((await listBackupFiles(dir, kind))[0]?.sequence ?? 0) + 1;
  const dest = join(
    dir,
    `${prefix}${String(sequence).padStart(8, "0")}-${label}.sqlite`,
  );
  await rm(dest, { force: true });
  db.run("VACUUM INTO ?", [dest]);

  for (const old of (await listBackupFiles(dir, kind)).slice(keep)) {
    await rm(join(dir, old.name), { force: true });
  }

  return dest;
}
