import type z from "zod";

import type {
  logEntrySchema,
  logFilterSchema,
  logFilterServiceSchema,
  logLevelSchema,
  logOriginSchema,
  logServiceSchema,
  logSourceStateSchema,
  logStreamSchema,
  logsClientMessageSchema,
  logsServerMessageSchema,
} from "./logs.protocol";

export type LogService = z.infer<typeof logServiceSchema>;
export type LogFilterService = z.infer<typeof logFilterServiceSchema>;
export type LogLevel = z.infer<typeof logLevelSchema>;
export type LogStream = z.infer<typeof logStreamSchema>;
export type LogOrigin = z.infer<typeof logOriginSchema>;
export type LogSourceState = z.infer<typeof logSourceStateSchema>;
export type LogEntry = z.infer<typeof logEntrySchema>;
export type LogFilter = z.infer<typeof logFilterSchema>;
export type LogsClientMessage = z.infer<typeof logsClientMessageSchema>;
export type LogsServerMessage = z.infer<typeof logsServerMessageSchema>;

/*
 * The log source seam. The admin server's log hub follows every source and
 * merges them; a new kind of source (the system journal) implements
 * `LogSource` and joins the hub's list.
 */

/**
 * A place in one source's stream, between two entries. Opaque to everyone
 * but the source that made it (a byte offset, a journal cursor).
 */
export type LogSourcePosition = string;

export type LogSourceStatus = {
  /** `rotated`: the source started over; it is available again. */
  state: LogSourceState;
  message: string;
};

/** An entry with the positions just before and just after it. */
export type LogSourceEntry = {
  entry: LogEntry;
  start: LogSourcePosition;
  end: LogSourcePosition;
};

export type LogSourceListener = {
  /** New lines, oldest first, and the live position just after them. */
  onEntries: (entries: LogSourceEntry[], position: LogSourcePosition) => void;
  onStatus: (status: LogSourceStatus) => void;
};

export type LogSourcePage = {
  /** Matching entries, oldest first. */
  entries: LogSourceEntry[];
  /** Before: the start of the stream was reached. After: `until` was reached. */
  done: boolean;
  /** After: the position was from before a rotation; the page reads from the start. */
  rotated?: boolean;
};

export type LogEntryPredicate = (entry: LogEntry) => boolean;

export type LogSource = {
  service: LogService;
  /**
   * Starts following new lines from the end. Resolves once the live
   * position is known: everything before it is history.
   */
  start: (listener: LogSourceListener) => Promise<void>;
  stop: () => Promise<void>;
  /** Just after the last entry handed to the listener. */
  getLivePosition: () => LogSourcePosition;
  getStatus: () => LogSourceStatus;
  /** Up to `limit` matching entries just before `before`, newest kept. */
  readBefore: (options: {
    before: LogSourcePosition;
    limit: number;
    matches: LogEntryPredicate;
  }) => Promise<LogSourcePage>;
  /** Up to `limit` matching entries from `after` up to `until`, oldest kept. */
  readAfter: (options: {
    after: LogSourcePosition;
    until: LogSourcePosition;
    limit: number;
    matches: LogEntryPredicate;
  }) => Promise<LogSourcePage>;
};

/** One position per service. */
export type LogPositions = Partial<Record<LogService, LogSourcePosition>>;
