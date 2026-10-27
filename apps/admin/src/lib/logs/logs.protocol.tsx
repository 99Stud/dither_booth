import z from "zod";
/*
 * The messages of the `/admin/logs` socket. The admin server and the Logs
 * page both validate with these schemas, so keep this file free of
 * server-only imports.
 */

import {
  LOG_FILTER_SERVICES,
  LOG_LEVELS,
  LOG_ORIGINS,
  LOG_SERVICES,
  LOG_SOURCE_STATES,
  LOG_STREAMS,
  LOGS_HISTORY_MAX_LIMIT,
} from "./logs.constants";

export const logServiceSchema = z.enum(LOG_SERVICES);
export const logFilterServiceSchema = z.enum(LOG_FILTER_SERVICES);
export const logLevelSchema = z.enum(LOG_LEVELS);
export const logStreamSchema = z.enum(LOG_STREAMS);
export const logOriginSchema = z.enum(LOG_ORIGINS);
export const logSourceStateSchema = z.enum(LOG_SOURCE_STATES);

export const logEntryErrorSchema = z.object({
  cause: z.string().optional(),
  message: z.string(),
  name: z.string().optional(),
  stack: z.string().optional(),
});

/** One log line, whatever its source. */
export const logEntrySchema = z.object({
  /** Stable across reads of the same line. */
  id: z.string(),
  /** ISO 8601. The event's own time when it has one, else when it was written. */
  timestamp: z.string(),
  service: logServiceSchema,
  stream: logStreamSchema,
  level: logLevelSchema,
  source: z.string().optional(),
  event: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  error: logEntryErrorSchema.optional(),
  /** The line as written, for display and copy. */
  raw: z.string(),
  origin: logOriginSchema,
  /** Browser lines only: the reporting device. */
  deviceId: z.string().optional(),
  runId: z.number().optional(),
});

/**
 * Which entries to show. A missing field matches everything; an empty list
 * matches nothing.
 */
export const logFilterSchema = z.object({
  services: z.array(logFilterServiceSchema).optional(),
  levels: z.array(logLevelSchema).optional(),
  /** Exact match on the entry's source, e.g. `engine.printer`. */
  source: z.string().trim().min(1).optional(),
  /** Case-insensitive substring of the raw line or its error. */
  text: z.string().trim().min(1).optional(),
});

/**
 * Client → server. Without a cursor: the latest page. `before`: the page
 * older than the cursor. `after`: the page newer than it (resume after a
 * reconnect). Send back the last cursor the server sent, from any message.
 */
export const logsHistoryRequestSchema = z
  .object({
    type: z.literal("history"),
    filter: logFilterSchema,
    limit: z.number().int().min(1).max(LOGS_HISTORY_MAX_LIMIT),
    before: z.string().min(1).optional(),
    after: z.string().min(1).optional(),
  })
  .refine((request) => !(request.before && request.after), {
    message: "Send either before or after, not both.",
  });

export const logsClientMessageSchema = logsHistoryRequestSchema;

export const logsHistoryMessageSchema = z.object({
  type: z.literal("history"),
  /** Oldest first. */
  entries: z.array(logEntrySchema),
  /** Opaque; send it back as `before` or `after`. */
  cursor: z.string(),
  /** `before`: nothing older is left. `after`: caught up; live appends follow. */
  done: z.boolean(),
});

export const logsAppendMessageSchema = z.object({
  type: z.literal("append"),
  /** New lines from every service, unfiltered, oldest first. */
  entries: z.array(logEntrySchema),
  /** Opaque; send it back as `after` to resume on a new socket. */
  cursor: z.string(),
});

export const logsSourceStatusMessageSchema = z.object({
  type: z.literal("source-status"),
  service: logServiceSchema,
  state: logSourceStateSchema,
  message: z.string(),
});

export const logsErrorMessageSchema = z.object({
  type: z.literal("error"),
  message: z.string(),
});

/** Server → client. */
export const logsServerMessageSchema = z.discriminatedUnion("type", [
  logsHistoryMessageSchema,
  logsAppendMessageSchema,
  logsSourceStatusMessageSchema,
  logsErrorMessageSchema,
]);
