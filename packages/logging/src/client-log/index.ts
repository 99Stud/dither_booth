import { z } from "zod";

export {
  CLIENT_LOG_MAX_BODY_BYTES,
  CLIENT_LOG_RATE_LIMIT,
  CLIENT_LOG_RATE_WINDOW_MS,
  CLIENT_LOG_ROUTE_PATH,
} from "./client-log.constants";

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
