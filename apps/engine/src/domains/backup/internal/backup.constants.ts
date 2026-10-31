import { EVENT_BACKUPS_DIR_NAME } from "@dither-booth/shared/server/database-backup";
import { resolve } from "node:path";

import { ENGINE_APP_ROOT, ENGINE_REPO_ROOT } from "#lib/constants";

export const BACKUP_LOG_SOURCE = "engine.backup";

/** Next to the database, on the booth's SSD, owned by the engine's user. */
export const EVENT_BACKUPS_DIR = resolve(
  ENGINE_APP_ROOT,
  "data",
  EVENT_BACKUPS_DIR_NAME,
);

/**
 * The newest ones again, on the SD card: `.local` outlives releases there
 * (`/opt/dither-booth-shared/.local`), so a dead SSD doesn't take them all.
 */
export const EVENT_BACKUPS_MIRROR_DIR = resolve(
  ENGINE_REPO_ROOT,
  ".local",
  EVENT_BACKUPS_DIR_NAME,
);

/** At most one backup this often, and only when the database changed. */
export const EVENT_BACKUP_EVERY_MS = 5 * 60_000;
/** How often the engine looks: a backup put off by a print waits this long. */
export const EVENT_BACKUP_CHECK_MS = 60_000;
/** Before a staff edit, unless one was taken this recently. */
export const EVENT_BACKUP_EDIT_GAP_MS = 60_000;
