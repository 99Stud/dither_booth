import { format } from "date-fns";

import type {
  LogEntry,
  LogFilter,
  LogFilterService,
  LogLevel,
} from "#lib/logs/logs.types";

import { notify } from "#lib/feedback/notify";
import { LOG_FILTER_SERVICES, LOG_LEVELS } from "#lib/logs/logs.constants";
import {
  getLogFilterService,
  isLogServiceShown,
  isRestartEntry,
  matchesLogFilter,
} from "#lib/logs/logs.utils";

import type { LogsTimelineItem } from "./Logs.types";

import { LOG_SERVICE_LABELS } from "./Logs.constants";

/** Whether a row shows under `filter`. Reconnect dividers always do. */
export function isLogsItemVisible(item: LogsTimelineItem, filter: LogFilter) {
  switch (item.kind) {
    case "entry":
      return matchesLogFilter(item.entry, filter);
    case "rotated":
      return isLogServiceShown(filter, item.service);
    case "reconnect":
      return true;
  }
}

/** Whether a filter hides anything. */
export function hasActiveLogFilter(filter: LogFilter) {
  return Object.keys(filter).length > 0;
}

/**
 * Turns `value` on or off in a filter list, where a missing list means
 * every value. Returns `undefined` once every value is on again.
 */
export function toggleFilterValue<T extends string>(
  current: readonly T[] | undefined,
  all: readonly T[],
  value: T,
): T[] | undefined {
  const selected = current ?? all;
  const next = selected.includes(value)
    ? selected.filter((item) => item !== value)
    : all.filter((item) => item === value || selected.includes(item));

  return next.length === all.length ? undefined : next;
}

/** `14:02:15.120`, local time. */
export function formatLogTime(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? timestamp
    : format(date, "HH:mm:ss.SSS");
}

/** `14:02:15`, local time, for dividers. */
export function formatLogDividerTime(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : format(date, "HH:mm:ss");
}

/** The service chip label of an entry: browser lines have their own. */
export function getLogServiceLabel(entry: LogEntry) {
  return LOG_SERVICE_LABELS[getLogFilterService(entry)];
}

/**
 * The short text after the event name: the error message, else the
 * details on one line. Plain-text lines show their raw text instead.
 */
export function getLogPreview(entry: LogEntry) {
  if (!entry.event) {
    return entry.raw;
  }

  if (entry.error?.message) {
    return entry.error.message;
  }

  if (entry.details && Object.keys(entry.details).length > 0) {
    return JSON.stringify(entry.details);
  }

  return "";
}

/** `text` cut around each case-insensitive match of `needle`. */
export function splitOnMatches(text: string, needle: string | undefined) {
  if (!needle) {
    return [{ text, isMatch: false }];
  }

  const parts: Array<{ text: string; isMatch: boolean }> = [];
  const haystack = text.toLowerCase();
  const target = needle.toLowerCase();
  let from = 0;

  for (;;) {
    const index = haystack.indexOf(target, from);
    if (index === -1) break;
    if (index > from)
      parts.push({ text: text.slice(from, index), isMatch: false });
    parts.push({
      text: text.slice(index, index + target.length),
      isMatch: true,
    });
    from = index + target.length;
  }

  if (from < text.length)
    parts.push({ text: text.slice(from), isMatch: false });

  return parts;
}

type LogCounts = {
  /** Error lines per service chip, whatever the service and level filters. The chips show it only while the service and errors show. */
  errorsByService: Record<LogFilterService, number>;
  /** Lines per level under the rest of the filter. */
  byLevel: Record<LogLevel, number>;
  /** Every source seen so far, sorted. */
  sources: string[];
};

/** The toolbar's counts over the lines kept in memory. */
export function getLogCounts(
  items: LogsTimelineItem[],
  filter: LogFilter,
): LogCounts {
  const errorsByService = Object.fromEntries(
    LOG_FILTER_SERVICES.map((service) => [service, 0]),
  ) as Record<LogFilterService, number>;
  const byLevel = Object.fromEntries(
    LOG_LEVELS.map((level) => [level, 0]),
  ) as Record<LogLevel, number>;
  const sources = new Set<string>();
  const { services: _services, levels: _levels, ...rest } = filter;
  const withoutServices = rest;
  const withoutLevels: LogFilter = filter.services
    ? { ...rest, services: filter.services }
    : rest;

  for (const item of items) {
    if (item.kind !== "entry") continue;
    const { entry } = item;

    if (entry.source) sources.add(entry.source);
    // A restart is a divider, not a line: it isn't counted.
    if (isRestartEntry(entry)) continue;
    if (entry.level === "error" && matchesLogFilter(entry, withoutServices)) {
      errorsByService[getLogFilterService(entry)] += 1;
    }
    if (matchesLogFilter(entry, withoutLevels)) {
      byLevel[entry.level] += 1;
    }
  }

  return {
    errorsByService,
    byLevel,
    sources: [...sources].sort(),
  };
}

/** Copies `text` and says so, or says why not. */
export async function copyLogText(text: string, success: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify.success(success);
  } catch {
    notify.error("Couldn't copy. Select the text and copy it instead.");
  }
}

/** The visible lines as newline-delimited JSON, one entry per line. */
export function toNdjson(items: LogsTimelineItem[]) {
  return items
    .filter((item) => item.kind === "entry")
    .map((item) => JSON.stringify(item.entry))
    .join("\n")
    .concat("\n");
}
