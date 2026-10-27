import type {
  LogEntry,
  LogFilter,
  LogPositions,
  LogService,
  LogSource,
  LogSourceEntry,
  LogSourcePage,
  LogSourceStatus,
} from "./logs.types";

import {
  LOGS_APPEND_BATCH_MAX_ENTRIES,
  LOGS_APPEND_BATCH_MS,
} from "./logs.constants";
import { matchesLogFilter } from "./logs.utils";

/*
 * The log hub: one follower per source, shared by every open Logs page.
 * Sources start with the first subscriber and stop with the last. Live
 * lines from every source are merged by time and sent in batches; history
 * pages are read from each source and merged the same way.
 */

/** A cursor position a source can't read. */
export class InvalidLogPositionError extends Error {
  constructor(position: string) {
    super(`Invalid log position: ${position}`);
    this.name = "InvalidLogPositionError";
  }
}

export type LogHubSubscriber = {
  /** Live lines from every source, oldest first, and the positions after them. */
  onAppend: (entries: LogEntry[], positions: LogPositions) => void;
  onStatus: (service: LogService, status: LogSourceStatus) => void;
};

export type LogHubSubscription = {
  /** Where this subscriber's live lines start: older lines are history. */
  positions: LogPositions;
  statuses: Array<{ service: LogService; status: LogSourceStatus }>;
  unsubscribe: () => void;
};

export type LogHubPage = {
  /** Oldest first. */
  entries: LogEntry[];
  positions: LogPositions;
  done: boolean;
};

export type LogHub = {
  subscribe: (subscriber: LogHubSubscriber) => Promise<LogHubSubscription>;
  /** The newest `limit` matching entries before `positions`. */
  readBefore: (options: {
    filter: LogFilter;
    limit: number;
    positions: LogPositions;
  }) => Promise<LogHubPage>;
  /** The oldest `limit` matching entries from `positions` up to `until`. */
  readAfter: (options: {
    filter: LogFilter;
    limit: number;
    positions: LogPositions;
    until: LogPositions;
  }) => Promise<LogHubPage & { rotated: LogService[] }>;
};

type Tagged = { service: LogService; item: LogSourceEntry };

/** Merges lists that are each in order into one list in time order. */
function mergeByTime<T>(lists: T[][], getEntry: (item: T) => LogEntry): T[] {
  const times = lists.map((list) =>
    list.map((item) => Date.parse(getEntry(item).timestamp) || 0),
  );
  const heads = lists.map(() => 0);
  const merged: T[] = [];

  for (;;) {
    let best = -1;

    for (const [listIndex, list] of lists.entries()) {
      if (heads[listIndex]! >= list.length) {
        continue;
      }

      if (
        best === -1 ||
        times[listIndex]![heads[listIndex]!]! < times[best]![heads[best]!]!
      ) {
        best = listIndex;
      }
    }

    if (best === -1) {
      return merged;
    }

    merged.push(lists[best]![heads[best]!]!);
    heads[best]! += 1;
  }
}

/** Whether a source can hold entries the filter's services let through. */
function isSourceWanted(filter: LogFilter, service: LogService) {
  return (
    !filter.services ||
    filter.services.includes(service) ||
    filter.services.includes("browser")
  );
}

export function createLogHub({
  batchMs = LOGS_APPEND_BATCH_MS,
  sources,
}: {
  batchMs?: number;
  sources: LogSource[];
}): LogHub {
  const subscribers = new Set<LogHubSubscriber>();
  const failedStatuses = new Map<LogService, LogSourceStatus>();
  let lifecycle = Promise.resolve();
  let running = false;
  /** Sources are starting or running: their lines are kept. */
  let following = false;
  /** Per source, where its lines held while starting begin. */
  let startedAt: LogPositions = {};
  let buffered = new Map<LogService, LogEntry[]>();
  let bufferedCount = 0;
  let livePositions: LogPositions = {};
  let flushedPositions: LogPositions = {};
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  const getStatus = (source: LogSource) =>
    failedStatuses.get(source.service) ?? source.getStatus();

  const flush = () => {
    clearTimeout(flushTimer);
    flushTimer = undefined;

    const lists = [...buffered.values()];
    buffered = new Map();
    bufferedCount = 0;
    flushedPositions = { ...livePositions };

    const entries = mergeByTime(lists, (entry) => entry);

    for (const subscriber of subscribers) {
      subscriber.onAppend(entries, flushedPositions);
    }
  };

  const receive = (
    service: LogService,
    items: LogSourceEntry[],
    position: string,
  ) => {
    if (!following || items.length === 0) {
      return;
    }

    const list = buffered.get(service) ?? [];

    // Lines that arrive while other sources start go out live once all
    // have started: history ends where the first of them begins.
    if (!running && list.length === 0) {
      startedAt[service] = items[0]!.start;
    }

    list.push(...items.map((item) => item.entry));
    buffered.set(service, list);
    bufferedCount += items.length;
    livePositions[service] = position;

    if (running) {
      scheduleFlush();
    }
  };

  const scheduleFlush = () => {
    if (bufferedCount >= LOGS_APPEND_BATCH_MAX_ENTRIES) {
      flush();
      return;
    }

    flushTimer ??= setTimeout(flush, batchMs);
  };

  const receiveStatus = (source: LogSource, status: LogSourceStatus) => {
    if (!following) {
      return;
    }

    if (!running) {
      // The source started over while others start: its held lines are
      // gone from where they were, and it follows from its new end.
      bufferedCount -= buffered.get(source.service)?.length ?? 0;
      buffered.delete(source.service);
      delete startedAt[source.service];
      livePositions[source.service] = source.getLivePosition();
      return;
    }

    // Lines read before the change go out first.
    if (flushTimer) {
      flush();
    }

    livePositions[source.service] = source.getLivePosition();
    flushedPositions[source.service] = livePositions[source.service];

    for (const subscriber of subscribers) {
      subscriber.onStatus(source.service, status);
    }
  };

  const startSource = async (source: LogSource) => {
    try {
      await source.start({
        onEntries: (items, position) =>
          receive(source.service, items, position),
        onStatus: (status) => receiveStatus(source, status),
      });
      failedStatuses.delete(source.service);
    } catch (error) {
      failedStatuses.set(source.service, {
        state: "unavailable",
        message: error instanceof Error ? error.message : String(error),
      });
    }

    if (!buffered.has(source.service)) {
      livePositions[source.service] = source.getLivePosition();
    }
  };

  const reconcile = () => {
    lifecycle = lifecycle.then(async () => {
      if (subscribers.size > 0 && !running) {
        livePositions = {};
        startedAt = {};
        following = true;
        await Promise.all(sources.map(startSource));
        flushedPositions = { ...livePositions, ...startedAt };
        running = true;

        // Not at once: the first subscriber gets its positions first.
        if (bufferedCount > 0) {
          flushTimer ??= setTimeout(flush, batchMs);
        }

        return;
      }

      if (subscribers.size === 0 && running) {
        running = false;
        following = false;
        clearTimeout(flushTimer);
        flushTimer = undefined;
        buffered = new Map();
        bufferedCount = 0;
        await Promise.all(sources.map((source) => source.stop()));
      }
    });

    return lifecycle;
  };

  const positionOf = (positions: LogPositions, source: LogSource) =>
    positions[source.service] ??
    flushedPositions[source.service] ??
    source.getLivePosition();

  const readPages = async (
    filter: LogFilter,
    read: (source: LogSource) => Promise<LogSourcePage>,
  ) =>
    await Promise.all(
      sources
        .filter((source) => isSourceWanted(filter, source.service))
        .map(async (source) => ({ source, page: await read(source) })),
    );

  return {
    subscribe: async (subscriber) => {
      subscribers.add(subscriber);
      await reconcile();

      return {
        positions: { ...flushedPositions },
        statuses: sources.map((source) => ({
          service: source.service,
          status: getStatus(source),
        })),
        unsubscribe: () => {
          if (subscribers.delete(subscriber)) {
            void reconcile();
          }
        },
      };
    },
    readBefore: async ({ filter, limit, positions }) => {
      const matches = (entry: LogEntry) => matchesLogFilter(entry, filter);
      const pages = await readPages(filter, (source) =>
        source.readBefore({
          before: positionOf(positions, source),
          limit,
          matches,
        }),
      );
      const merged = mergeByTime(
        pages.map(({ page, source }) =>
          page.entries.map(
            (item): Tagged => ({ service: source.service, item }),
          ),
        ),
        (tagged) => tagged.item.entry,
      );
      const taken = merged.slice(-limit);
      const nextPositions: LogPositions = { ...positions };

      for (const tagged of taken.toReversed()) {
        nextPositions[tagged.service] = tagged.item.start;
      }

      return {
        entries: taken.map((tagged) => tagged.item.entry),
        positions: nextPositions,
        done: merged.length <= limit && pages.every(({ page }) => page.done),
      };
    },
    readAfter: async ({ filter, limit, positions, until }) => {
      const matches = (entry: LogEntry) => matchesLogFilter(entry, filter);
      const untilOf = (source: LogSource) => positionOf(until, source);
      const pages = await readPages(filter, (source) =>
        source.readAfter({
          after: positions[source.service] ?? untilOf(source),
          until: untilOf(source),
          limit,
          matches,
        }),
      );
      const merged = mergeByTime(
        pages.map(({ page, source }) =>
          page.entries.map(
            (item): Tagged => ({ service: source.service, item }),
          ),
        ),
        (tagged) => tagged.item.entry,
      );
      const taken = merged.slice(0, limit);
      const nextPositions: LogPositions = { ...positions };

      // History is filtered: a source the filter skips is skipped up to `until`.
      for (const source of sources) {
        nextPositions[source.service] = untilOf(source);
      }

      for (const { page, source } of pages) {
        const takenOfSource = taken.filter(
          (tagged) => tagged.service === source.service,
        );
        const last = takenOfSource.at(-1);

        if (takenOfSource.length === page.entries.length && page.done) {
          continue;
        }

        nextPositions[source.service] = last
          ? last.item.end
          : (positions[source.service] ?? untilOf(source));
      }

      return {
        entries: taken.map((tagged) => tagged.item.entry),
        positions: nextPositions,
        done: merged.length <= limit && pages.every(({ page }) => page.done),
        rotated: pages
          .filter(({ page }) => page.rotated)
          .map(({ source }) => source.service),
      };
    },
  };
}
