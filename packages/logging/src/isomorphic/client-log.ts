import { z } from "zod";

/*
 * Browser reports: what the browser logger sends to `POST /client-log`,
 * and the limits the server that receives them enforces.
 */

/** Where browsers send their warnings and errors, on the server that served the page. */
export const CLIENT_LOG_ROUTE_PATH = "/client-log";

/** Largest report body the server reads, in bytes. */
export const CLIENT_LOG_MAX_BODY_BYTES = 16 * 1024;

/**
 * Reports of one level (warnings, or errors) one device may send per
 * window before the server refuses them.
 */
export const CLIENT_LOG_RATE_LIMIT = 30;

/** The rate limit window, in milliseconds. */
export const CLIENT_LOG_RATE_WINDOW_MS = 60_000;

/** How much of an error's stack a report keeps when the whole report is too big. */
export const CLIENT_LOG_TRIMMED_STACK_LENGTH = 4096;

/** How much of an error's message or cause a report keeps when it is too big. */
export const CLIENT_LOG_TRIMMED_TEXT_LENGTH = 1024;

/**
 * One browser warning or error, as the browser logger sends it with a
 * beacon. The server re-logs it marked `origin: "browser"`.
 */
export const clientLogReportSchema = z.strictObject({
  deviceId: z.string().min(1).max(128),
  details: z.record(z.string(), z.unknown()).optional(),
  error: z
    .strictObject({
      cause: z.string().optional(),
      message: z.string(),
      name: z.string().optional(),
      stack: z.string().optional(),
    })
    .optional(),
  event: z.string().min(1).max(128),
  level: z.enum(["error", "warn"]),
  runId: z.number().int().positive(),
  source: z.string().min(1).max(128),
});

export type ClientLogReport = z.infer<typeof clientLogReportSchema>;
