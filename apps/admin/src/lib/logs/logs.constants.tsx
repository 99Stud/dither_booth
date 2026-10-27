/*
 * Shared by the admin server and the Logs page: keep this file free of
 * server-only imports.
 */

/** The Logs page's WebSocket route on the admin server. */
export const LOGS_ROUTE_PATH = "/admin/logs";

/** Services that own a log source. Browser is an origin, not a service. */
export const LOG_SERVICES = ["engine", "shutter", "admin", "system"] as const;

/** What the page's service chips toggle: every service, plus browser lines. */
export const LOG_FILTER_SERVICES = [...LOG_SERVICES, "browser"] as const;

export const LOG_LEVELS = ["error", "warn", "info"] as const;

/** `out`/`err` come from PM2 files; `journal` from the system journal. */
export const LOG_STREAMS = ["out", "err", "journal"] as const;

export const LOG_ORIGINS = ["server", "browser"] as const;

export const LOG_SOURCE_STATES = [
  "available",
  "unavailable",
  "rotated",
] as const;

/** Most entries one history page may ask for. */
export const LOGS_HISTORY_MAX_LIMIT = 1000;

/* Server side: the log hub and the PM2 file sources. */

/** Live lines are sent to sockets in batches at most this often. */
export const LOGS_APPEND_BATCH_MS = 200;
/** A batch that reaches this many entries is sent at once. */
export const LOGS_APPEND_BATCH_MAX_ENTRIES = 1000;
/**
 * Live lines held for one socket while it catches up or waits for a
 * history page. Past this, the socket is closed and the page resumes.
 */
export const LOGS_MAX_HELD_ENTRIES = 5000;
/** PM2 files are checked this often, on top of file-change events. */
export const LOGS_POLL_INTERVAL_MS = 1000;
/** Files are read in chunks of this size, backward for older pages. */
export const LOGS_READ_CHUNK_BYTES = 64 * 1024;
/** A longer file line is cut to this many bytes. */
export const LOGS_MAX_LINE_BYTES = 64 * 1024;

export const LOGS_INVALID_CLOSE_CODE = 1008;
export const LOGS_INTERNAL_ERROR_CLOSE_CODE = 1011;
export const LOGS_FELL_BEHIND_CLOSE_CODE = 1013;

/** PM2's log folder, relative to the repo (`pm2.config.js`). */
export const LOGS_PM2_LOG_RELATIVE_DIR = "logs/pm2";
/**
 * The system source's units; must match the CLI's `SERVICE_NAME` and
 * `NETWORK_SERVICE_NAME`. Kernel messages are read too.
 */
export const LOGS_JOURNAL_UNITS = [
  "ditherbooth.service",
  "ditherbooth-network.service",
  "NetworkManager.service",
] as const;
/** A `journalctl --follow` that exits is started again after this long. */
export const LOGS_JOURNAL_RESTART_DELAY_MS = 5000;

/** PM2 process per service; must match `PM2_PROCESS_NAMES` in `pm2.config.js`. */
export const LOGS_PM2_PROCESS_NAMES = {
  engine: "dither-booth-engine",
  shutter: "dither-booth-shutter",
  admin: "dither-booth-admin",
} as const;
