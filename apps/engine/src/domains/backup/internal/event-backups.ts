import type { Database } from "bun:sqlite";

import { getKioskErrorDiagnostics } from "@dither-booth/logging";
import {
  backupDatabase,
  backupStamp,
  EVENT_BACKUPS_MIRRORED,
} from "@dither-booth/shared/server/database-backup";

import {
  EVENT_BACKUP_CHECK_MS,
  EVENT_BACKUP_EDIT_GAP_MS,
  EVENT_BACKUP_EVERY_MS,
} from "./backup.constants";

type Log = (
  level: "info" | "warn" | "error",
  event: string,
  details?: Record<string, unknown>,
) => void;

/** Why a backup was taken; it ends the file's name. */
export type EventBackupReason = "start" | "interval" | "edit" | "stop";

/**
 * Copies of the database while the booth runs, so an event can go back to
 * how it stood a few minutes before a bad edit, a broken update or a
 * damaged database: one at start, one every 5 minutes while something
 * changed, one before a staff edit, and a last one at a clean stop. Each
 * goes to the SSD and, the newest ones, to the SD card. A backup never
 * gets in a guest's way: it waits for the print to end, and a failure is
 * logged, never thrown.
 */
export type EventBackups = {
  start: () => void;
  /** Before an admin change: a backup, if something changed since the last one. */
  beforeEdit: () => Promise<void>;
  /** Takes the last backup if anything changed since the one before. */
  stop: () => Promise<void>;
};

export function createEventBackups(deps: {
  /** The engine's connection: the only one that writes. */
  sqlite: Database;
  dir: string;
  /** A second copy of the newest, on another disk. */
  mirrorDir: string;
  /** A ticket is printing: VACUUM blocks the event loop for its length. */
  isBusy: () => boolean;
  log: Log;
  /** Names the files. */
  now?: () => Date;
  /** Spaces the backups: monotonic, so a clock set back doesn't stop them. */
  elapsedMs?: () => number;
  everyMs?: number;
  checkMs?: number;
  editGapMs?: number;
}): EventBackups {
  const {
    sqlite,
    dir,
    mirrorDir,
    isBusy,
    log,
    now = () => new Date(),
    elapsedMs = () => performance.now(),
    everyMs = EVENT_BACKUP_EVERY_MS,
    checkMs = EVENT_BACKUP_CHECK_MS,
    editGapMs = EVENT_BACKUP_EDIT_GAP_MS,
  } = deps;
  let timer: ReturnType<typeof setInterval> | undefined;
  let taking: Promise<void> | null = null;
  let lastAt: number | null = null;
  // Rows this connection changed, at the last backup. VACUUM INTO adds none.
  let changesAtLast: number | null = null;

  const totalChanges = () =>
    sqlite.query<{ count: number }, []>("SELECT total_changes() AS count").get()
      ?.count ?? 0;

  const copyTo = async (
    reason: EventBackupReason,
    target: string,
    label: string,
    keep?: number,
  ) => {
    try {
      const path = await backupDatabase(sqlite, {
        dir: target,
        kind: "event",
        label,
        keep,
      });
      log("info", "event-backup-taken", { path, reason });
      return true;
    } catch (error) {
      log("warn", "event-backup-failed", {
        dir: target,
        reason,
        error: getKioskErrorDiagnostics(error, "Database backup failed."),
      });
      return false;
    }
  };

  const take = (reason: EventBackupReason) => {
    taking ??= (async () => {
      const changes = totalChanges();
      const label = `${backupStamp(now())}-${reason}`;
      const onSsd = await copyTo(reason, dir, label);
      const onSd = await copyTo(
        reason,
        mirrorDir,
        label,
        EVENT_BACKUPS_MIRRORED,
      );

      if (onSsd || onSd) {
        changesAtLast = changes;
        lastAt = elapsedMs();
      }
    })().finally(() => {
      taking = null;
    });

    return taking;
  };

  const changed = () =>
    changesAtLast === null || totalChanges() !== changesAtLast;
  const sinceLast = () =>
    lastAt === null ? Number.POSITIVE_INFINITY : elapsedMs() - lastAt;

  return {
    start() {
      if (timer) return;
      void take("start");
      timer = setInterval(() => {
        if (sinceLast() >= everyMs && changed() && !isBusy()) {
          void take("interval");
        }
      }, checkMs);
    },
    async beforeEdit() {
      await taking;
      if (sinceLast() >= editGapMs && changed()) await take("edit");
    },
    async stop() {
      clearInterval(timer);
      timer = undefined;
      await taking;
      if (changed()) await take("stop");
    },
  };
}
