import { z } from "zod";

/**
 * The Hub's alerts, in one place: their keys and severities (the
 * `alert_key_known` and severity checks in the Hub's migrations hold the
 * same lists), the events a push is sent for, and the words staff read,
 * from the glossary. A new alert adds its key here and its words below; the
 * compiler then asks for the rest.
 */

export const ALERT_KEYS = [
  "printer.paper-out",
  "printer.error",
  "printer.disconnected",
  "printer.paper-near-end",
  "printer.cover-open",
  "booth.silent",
] as const;

export type AlertKey = (typeof ALERT_KEYS)[number];

export const alertSeveritySchema = z.enum(["warn", "critical"]);

export type AlertSeverity = z.infer<typeof alertSeveritySchema>;

/** What a push is sent for: an alert opened, closed, or still waiting. */
export const alertEventSchema = z.enum(["opened", "resolved", "reminder"]);

export type AlertEvent = z.infer<typeof alertEventSchema>;

export type AlertWording = {
  /** The condition, as the glossary names it. */
  what: string;
  /** What staff should do about it. */
  todo: string;
  /** What "back to normal" means for it. */
  fixed: string;
};

export const ALERT_WORDING: Record<AlertKey, AlertWording> = {
  "printer.paper-out": {
    what: "Out of paper",
    todo: "The booth can't print. Load a new roll.",
    fixed: "Paper is back in.",
  },
  "printer.error": {
    what: "Printer error",
    todo: "The booth can't print. Check the printer.",
    fixed: "The printer works again.",
  },
  "printer.disconnected": {
    what: "Printer not connected",
    todo: "The booth can't print. Check the printer's USB cable and power.",
    fixed: "The printer is connected again.",
  },
  "printer.paper-near-end": {
    what: "Paper low",
    todo: "Have a new roll ready.",
    fixed: "A new roll is in.",
  },
  "printer.cover-open": {
    what: "Cover open",
    todo: "Close the printer cover.",
    fixed: "The cover is closed.",
  },
  "booth.silent": {
    what: "Silent booth",
    todo: "No news for 3 minutes. Check its power and network.",
    fixed: "It's reporting again.",
  },
};

const UNKNOWN_WORDING: AlertWording = {
  what: "Alert",
  todo: "Check the booth.",
  fixed: "It's fixed.",
};

/** The words for a key, even one this release doesn't know yet. */
export const alertWording = (key: string): AlertWording =>
  (ALERT_WORDING as Record<string, AlertWording | undefined>)[key] ??
  UNKNOWN_WORDING;
