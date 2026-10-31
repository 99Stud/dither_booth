import type { Database } from "bun:sqlite";

import { getKioskErrorDiagnostics } from "@dither-booth/logging";
import {
  backupDatabase,
  backupStamp,
  EVENT_BACKUP_PREFIX,
  EVENT_BACKUPS_KEPT,
} from "@dither-booth/shared/server/database-backup";

import {
  EVENT_BACKUP_CHECK_MS,
  EVENT_BACKUP_EVERY_MS,
} from "./backup.constants";

type Log = (
  level: "info" | "warn" | "error",
  event: string,
  details?: Record<string, unknown>,
) => void;

/** Why a backup was taken; it ends the file's name. */
export type EventBackupReason = "start" | "interval" | "stop";

/**
 * Copies of the database while the booth runs, so an event can go back to
 * how it stood a few minutes before a crash, a bad edit or a broken
 * update: one at start, then one every 5 minutes while something changed,
 * and a last one at a clean stop. A backup never gets in a guest's way: it
 * waits for the print to end, and a failure is logged, never thrown.
 */
export type EventBackups = {
  start: () => void;
  /** Takes the last backup if anything changed since the one before. */
  stop: () => Promise<void>;
};

export function createEventBackups(deps: {
  /** The engine's connection: the only one that writes. */
  sqlite: Database;
  dir: string;
  /** A ticket is printing: VACUUM blocks the event loop for its length. */
  isBusy: () => boolean;
  log: Log;
  now?: () => Date;
  everyMs?: number;
  checkMs?: number;
}): EventBackups {
  const {
    sqlite,
    dir,
    isBusy,
    log,
    now = () => new Date(),
    everyMs = EVENT_BACKUP_EVERY_MS,
    checkMs = EVENT_BACKUP_CHECK_MS,
  } = deps;
  let timer: ReturnType<typeof setInterval> | undefined;
  let taking: Promise<void> | null = null;
  let lastAt = 0;
  // Rows this connection changed, at the last backup. VACUUM INTO adds none.
  let changesAtLast: number | null = null;

  const totalChanges = () =>
    sqlite.query<{ count: number }, []>("SELECT total_changes() AS count").get()
      ?.count ?? 0;

  const take = (reason: EventBackupReason) => {
    taking ??= (async () => {
      const changes = totalChanges();
      const at = now();

      try {
        const path = await backupDatabase(sqlite, {
          dir,
          prefix: EVENT_BACKUP_PREFIX,
          label: `${backupStamp(at)}-${reason}`,
          keep: EVENT_BACKUPS_KEPT,
        });
        changesAtLast = changes;
        lastAt = at.getTime();
        log("info", "event-backup-taken", { path, reason });
      } catch (error) {
        log("warn", "event-backup-failed", {
          reason,
          error: getKioskErrorDiagnostics(error, "Database backup failed."),
        });
      }
    })().finally(() => {
      taking = null;
    });

    return taking;
  };

  const changed = () =>
    changesAtLast === null || totalChanges() !== changesAtLast;

  return {
    start() {
      if (timer) return;
      void take("start");
      timer = setInterval(() => {
        if (now().getTime() - lastAt >= everyMs && changed() && !isBusy()) {
          void take("interval");
        }
      }, checkMs);
    },
    async stop() {
      clearInterval(timer);
      timer = undefined;
      await taking;
      if (changed()) await take("stop");
    },
  };
}
