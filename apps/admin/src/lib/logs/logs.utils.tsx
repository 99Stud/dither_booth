/*
 * Shared by the admin server (history pages) and the Logs page (live
 * lines), so both always agree. Keep this file free of server-only imports.
 */

import type { LogEntry, LogFilter, LogFilterService } from "./logs.types";

/** The service chip an entry belongs to: browser lines have their own. */
export function getLogFilterService(entry: LogEntry): LogFilterService {
  return entry.origin === "browser" ? "browser" : entry.service;
}

/** Whether `entry` passes every part of `filter`. */
export function matchesLogFilter(entry: LogEntry, filter: LogFilter) {
  if (
    filter.services &&
    !filter.services.includes(getLogFilterService(entry))
  ) {
    return false;
  }

  if (filter.levels && !filter.levels.includes(entry.level)) {
    return false;
  }

  if (filter.source && entry.source !== filter.source) {
    return false;
  }

  if (filter.text) {
    const needle = filter.text.toLowerCase();
    const haystacks = [
      entry.raw,
      entry.error?.message,
      entry.error?.cause,
      entry.error?.stack,
    ];

    return haystacks.some((haystack) =>
      haystack?.toLowerCase().includes(needle),
    );
  }

  return true;
}
