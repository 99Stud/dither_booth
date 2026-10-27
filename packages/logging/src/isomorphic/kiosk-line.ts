import { tryParseJson } from "@dither-booth/shared/runtime";
import { z } from "zod";

/*
 * The kiosk log line: what `logKioskEvent` writes on a server, and what the
 * admin's Logs page reads back. Writer and readers share this file, so the
 * format lives in one place.
 */

/** Starts every kiosk line, before a space and the event's JSON. */
export const KIOSK_LOG_PREFIX = "[kiosk]";

/** The event every server logs once it listens: the Logs page draws a restart there. */
export const SERVER_STARTED_EVENT = "server-started";

export const kioskLogLevelSchema = z.enum(["error", "info", "warn"]);

export const kioskLogErrorSchema = z.object({
  cause: z.string().optional(),
  message: z.string(),
  name: z.string().optional(),
  stack: z.string().optional(),
});

/** One kiosk event, as the JSON after the prefix. */
export const kioskLogLineSchema = z.object({
  loggedAt: z.string().optional(),
  level: kioskLogLevelSchema,
  source: z.string(),
  event: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  error: kioskLogErrorSchema.optional(),
  /** Set when a server re-logs a browser report. */
  origin: z.literal("browser").optional(),
  deviceId: z.string().optional(),
  runId: z.number().optional(),
});

export type KioskLogLine = z.infer<typeof kioskLogLineSchema>;

/** The event a kiosk line holds, or `undefined` for any other line. */
export function parseKioskLogLine(text: string): KioskLogLine | undefined {
  const prefix = `${KIOSK_LOG_PREFIX} `;

  if (!text.startsWith(prefix)) {
    return undefined;
  }

  const parsed = kioskLogLineSchema.safeParse(
    tryParseJson(text.slice(prefix.length)),
  );

  return parsed.success ? parsed.data : undefined;
}
