import type { KioskLogLine } from "../isomorphic/kiosk-line";

import { serializeLogDetails } from "./logging.serialize";

const INDENT = "  ";

const pad = (value: number, width: number) => {
  return String(value).padStart(width, "0");
};

/** Local wall-clock time to the millisecond, or the raw value if it isn't a date. */
const formatTime = (loggedAt: string | undefined) => {
  const date = loggedAt ? new Date(loggedAt) : new Date();

  if (Number.isNaN(date.getTime())) {
    return loggedAt ?? "";
  }

  return `${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}:${pad(date.getSeconds(), 2)}.${pad(date.getMilliseconds(), 3)}`;
};

const indentBlock = (text: string) => {
  return text
    .split("\n")
    .map((line) => `${INDENT}${line}`)
    .join("\n");
};

/**
 * The same event as the kiosk line, laid out for a terminal: one header line
 * (time, level, source, event), then the details as indented JSON and the
 * error's stack as it is, each under its own label. Secrets are redacted the
 * same way as on the JSON line.
 */
export const formatReadableLogEntry = (entry: KioskLogLine) => {
  const browser =
    entry.origin === "browser"
      ? ` (browser ${entry.deviceId ?? "?"} run ${entry.runId ?? "?"})`
      : "";
  const lines = [
    `${formatTime(entry.loggedAt)} ${entry.level.toUpperCase().padEnd(5)} ${entry.source} ${entry.event}${browser}`,
  ];

  if (entry.details) {
    lines.push(
      `${INDENT}details: ${indentBlock(serializeLogDetails(entry.details, 2)).trimStart()}`,
    );
  }

  if (entry.error) {
    const { cause, message, name, stack } = entry.error;
    const summary = name ? `${name}: ${message}` : message;

    lines.push(`${INDENT}error: ${indentBlock(stack ?? summary).trimStart()}`);

    if (cause) {
      lines.push(`${INDENT}cause: ${cause}`);
    }
  }

  return lines.join("\n");
};
