/*
 * Shared by the admin server and the Logs page: keep this file free of
 * server-only imports.
 */

import {
  BOOTH_NETWORK_SERVICE_UNIT,
  BOOTH_SERVICE_UNIT,
} from "@dither-booth/shared/booth-system";

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
/**
 * Most PM2 envelopes joined into one record when an output line was cut
 * across chunks. A longer run isn't joined at all.
 */
export const LOGS_MAX_JOINED_CHUNKS = 8;
/** How long a cut line at the end of a file waits for its next chunk. */
export const LOGS_CONTINUATION_GRACE_MS = 1000;

export const LOGS_INVALID_CLOSE_CODE = 1008;
export const LOGS_INTERNAL_ERROR_CLOSE_CODE = 1011;
export const LOGS_FELL_BEHIND_CLOSE_CODE = 1013;

/** The system source's units. Kernel messages are read too. */
export const LOGS_JOURNAL_UNITS = [
  BOOTH_SERVICE_UNIT,
  BOOTH_NETWORK_SERVICE_UNIT,
  "NetworkManager.service",
] as const;
/** A `journalctl --follow` that exits is started again after this long. */
export const LOGS_JOURNAL_RESTART_DELAY_MS = 5000;
