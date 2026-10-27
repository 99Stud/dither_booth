/*
 * Shared by the admin server (history pages) and the Logs page (live
 * lines), so both always agree. Keep this file free of server-only imports.
 */

import type { LogEntry, LogFilter, LogFilterService } from "./logs.types";

import { LOGS_RESTART_EVENT } from "./logs.constants";

/** The service chip an entry belongs to: browser lines have their own. */
export function getLogFilterService(entry: LogEntry): LogFilterService {
  return entry.origin === "browser" ? "browser" : entry.service;
}

/** Whether `filter` shows `service`'s lines: no services list shows all. */
export function isLogServiceShown(
  filter: LogFilter,
  service: LogFilterService,
) {
  return !filter.services || filter.services.includes(service);
}

/** A server's start: a restart divider on the page, not a line. */
export function isRestartEntry(entry: LogEntry) {
  return entry.event === LOGS_RESTART_EVENT && entry.origin === "server";
}

/**
 * Whether `entry` passes every part of `filter`. A restart only has to
 * pass the services: it explains the lines around it, whatever they are.
 */
export function matchesLogFilter(entry: LogEntry, filter: LogFilter) {
  if (!isLogServiceShown(filter, getLogFilterService(entry))) {
    return false;
  }

  if (isRestartEntry(entry)) {
    return true;
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
