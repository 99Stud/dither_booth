import z from "zod";
/*
 * The Logs page's URL: its filter as search params, so a filtered view is a
 * link. Lists are comma-separated (`?services=engine&levels=warn,error`) to
 * keep shared links readable. Browser-safe.
 */

import type { LogFilter, LogFilterService, LogLevel } from "./logs.types";

import { LOG_FILTER_SERVICES, LOG_LEVELS } from "./logs.constants";

/** The Logs page's route in the admin. */
export const LOGS_PAGE_PATH = "/logs";

/** A search param as text, whatever the router parsed it as. */
const searchTextSchema = z.preprocess(
  (value) =>
    value === undefined || value === null ? undefined : String(value),
  z.string().optional(),
);

export const logsSearchSchema = z.object({
  /** Comma-separated service chips; empty shows no service. Absent: all. */
  services: searchTextSchema,
  /** Comma-separated levels; empty shows no level. Absent: all. */
  levels: searchTextSchema,
  /** One log source, e.g. `engine.printer`. */
  source: searchTextSchema,
  /** Text to find in the line or its error. */
  q: searchTextSchema,
});

/** A Logs URL's search params. A missing one doesn't filter. */
export type LogsSearch = {
  services?: string;
  levels?: string;
  source?: string;
  q?: string;
};

/** The route's `validateSearch`: unknown params and bad values are dropped. */
export function validateLogsSearch(
  search: Record<string, unknown>,
): LogsSearch {
  return getLogsSearchFromFilter(
    getLogFilterFromSearch(logsSearchSchema.parse(search)),
  );
}

function parseList<T extends string>(
  text: string | undefined,
  allowed: readonly T[],
): T[] | undefined {
  if (text === undefined) {
    return undefined;
  }

  const values = text
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is T =>
      (allowed as readonly string[]).includes(value),
    );

  return allowed.filter((value) => values.includes(value));
}

function trimmedOrUndefined(text: string | undefined) {
  const trimmed = text?.trim();
  return trimmed ? trimmed : undefined;
}

/** The filter a Logs URL asks for. */
export function getLogFilterFromSearch(search: LogsSearch): LogFilter {
  const filter: LogFilter = {};
  const services = parseList<LogFilterService>(
    search.services,
    LOG_FILTER_SERVICES,
  );
  const levels = parseList<LogLevel>(search.levels, LOG_LEVELS);
  const source = trimmedOrUndefined(search.source);
  const text = trimmedOrUndefined(search.q);

  // Every service or level listed is the same as none listed.
  if (services && services.length < LOG_FILTER_SERVICES.length) {
    filter.services = services;
  }
  if (levels && levels.length < LOG_LEVELS.length) {
    filter.levels = levels;
  }
  if (source) filter.source = source;
  if (text) filter.text = text;

  return filter;
}

/** The search params of a Logs URL showing `filter`. */
export function getLogsSearchFromFilter(filter: LogFilter): LogsSearch {
  const search: LogsSearch = {};

  if (filter.services) search.services = filter.services.join(",");
  if (filter.levels) search.levels = filter.levels.join(",");
  if (filter.source) search.source = filter.source;
  if (filter.text) search.q = filter.text;

  return search;
}
