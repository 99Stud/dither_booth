import type { LogFilterService, LogLevel } from "#lib/logs/logs.types";

export const LOGS_PAGE_LOG_SOURCE = "admin.logs";

/** Lines asked for per history page: the first one, and each older one. */
export const LOGS_PAGE_HISTORY_LIMIT = 500;
/** Most lines the page keeps in memory; the oldest are dropped past it. */
export const LOGS_PAGE_MAX_ENTRIES = 10_000;

/** Reconnect waits: doubling from the first, capped at the last. */
export const LOGS_RECONNECT_FIRST_DELAY_MS = 1000;
export const LOGS_RECONNECT_MAX_DELAY_MS = 10_000;
/** Failed attempts in a row before the badge says Offline. */
export const LOGS_OFFLINE_AFTER_ATTEMPTS = 3;

/**
 * How long the list must stay off its bottom before the reader counts as
 * scrolled up: new lines push it off for a frame before it follows them.
 */
export const LOGS_LEFT_BOTTOM_GRACE_MS = 300;

/** How long typing in search waits before the URL (and the view) follow. */
export const LOGS_SEARCH_DEBOUNCE_MS = 250;

/**
 * Virtuoso's index of the first row. Older pages are prepended by lowering
 * it, and it must stay positive, so it starts high.
 */
export const LOGS_FIRST_ITEM_INDEX = 1_000_000;

/** A server's start event, shown as a restart divider. */
export const LOGS_RESTART_EVENT = "server-started";

export const LOG_SERVICE_LABELS: Record<LogFilterService, string> = {
  engine: "Engine",
  shutter: "Shutter",
  admin: "Admin",
  system: "System",
  browser: "Browser",
};

export const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  error: "Error",
  warn: "Warn",
  info: "Info",
};
