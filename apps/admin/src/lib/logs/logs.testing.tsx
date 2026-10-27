import type { BrowserServerWebSocket } from "@dither-booth/browser-server/internal/browser-server.types";

import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  LogEntry,
  LogService,
  LogSource,
  LogSourceEntry,
  LogSourceListener,
  LogSourceStatus,
  LogsServerMessage,
} from "./logs.types";

/*
 * Test helpers for the `/admin/logs` socket seam: a fake socket, PM2 log
 * files in a temp folder, and an in-memory log source for any service.
 */

const PM2_PROCESS_NAMES: Record<Exclude<LogService, "system">, string> = {
  admin: "dither-booth-admin",
  engine: "dither-booth-engine",
  shutter: "dither-booth-shutter",
};

/** A socket that records what the route sends and whether it closed. */
export function createTestLogsSocket() {
  const messages: LogsServerMessage[] = [];
  const closes: Array<{ code?: number; reason?: string }> = [];
  const socket = {
    close: (code?: number, reason?: string) => {
      closes.push({ code, reason });
    },
    send: (message: string) => {
      messages.push(JSON.parse(message) as LogsServerMessage);
      return message.length;
    },
  } as unknown as BrowserServerWebSocket;

  const ofType = <T extends LogsServerMessage["type"]>(type: T) =>
    messages.filter(
      (message): message is Extract<LogsServerMessage, { type: T }> =>
        message.type === type,
    );

  return {
    closes,
    messages,
    socket,
    histories: () => ofType("history"),
    lastHistory: () => ofType("history").at(-1),
    appended: () => ofType("append").flatMap((message) => message.entries),
    lastCursor: () =>
      messages
        .filter(
          (message) => message.type === "history" || message.type === "append",
        )
        .at(-1)?.cursor,
    statuses: () => ofType("source-status"),
  };
}

/** Polls until `check` stops throwing, or rethrows after `timeoutMs`. */
export async function eventually(check: () => void, timeoutMs = 2000) {
  const startedAt = Date.now();

  for (;;) {
    try {
      check();
      return;
    } catch (error) {
      if (Date.now() - startedAt > timeoutMs) {
        throw error;
      }

      await Bun.sleep(5);
    }
  }
}

/** One PM2 `log_type: "json"` envelope line, as PM2 7 writes it. */
export function pm2Envelope({
  message,
  service,
  timestamp,
  type = "out",
}: {
  message: string;
  service: Exclude<LogService, "system">;
  timestamp: string;
  type?: "err" | "out";
}) {
  return `${JSON.stringify({
    message,
    timestamp,
    type,
    process_id: 0,
    app_name: PM2_PROCESS_NAMES[service],
  })}\n`;
}

/** A `[kiosk]` line from the shared logger, newline included. */
export function kioskMessage(payload: {
  loggedAt: string;
  level: "error" | "info" | "warn";
  source: string;
  event: string;
  details?: Record<string, unknown>;
  error?: { message: string; stack?: string };
  origin?: "browser";
  deviceId?: string;
  runId?: number;
}) {
  return `[kiosk] ${JSON.stringify(payload)}\n`;
}

/** A temp `logs/pm2` folder with helpers to write each service's file. */
export async function createTestPm2LogDir() {
  const logDir = await mkdtemp(join(tmpdir(), "dither-booth-logs-"));
  const pathOf = (service: Exclude<LogService, "system">) =>
    join(logDir, `${PM2_PROCESS_NAMES[service]}.log`);

  return {
    logDir,
    pathOf,
    append: (service: Exclude<LogService, "system">, ...lines: string[]) =>
      appendFile(pathOf(service), lines.join("")),
    write: (service: Exclude<LogService, "system">, ...lines: string[]) =>
      writeFile(pathOf(service), lines.join("")),
    cleanup: () => rm(logDir, { force: true, recursive: true }),
  };
}

/**
 * An in-memory source: positions are indexes into its list of entries.
 * `push` adds a live line; `setStatus` reports a state change.
 */
export function createFakeLogSource({
  entries: initialEntries = [],
  service,
  status: initialStatus = { state: "available", message: "Fake source." },
}: {
  entries?: LogEntry[];
  service: LogService;
  status?: LogSourceStatus;
}) {
  const entries = [...initialEntries];
  let listener: LogSourceListener | undefined;
  let status = initialStatus;
  let livePosition = entries.length;
  const lifecycle = { starts: 0, stops: 0 };

  const toSourceEntry = (index: number): LogSourceEntry => ({
    entry: entries[index]!,
    start: String(index),
    end: String(index + 1),
  });

  const source: LogSource = {
    service,
    start: async (nextListener) => {
      lifecycle.starts += 1;
      listener = nextListener;
      livePosition = entries.length;
    },
    stop: async () => {
      lifecycle.stops += 1;
      listener = undefined;
    },
    getLivePosition: () => String(livePosition),
    getStatus: () => status,
    readBefore: async ({ before, limit, matches }) => {
      const page: LogSourceEntry[] = [];
      let index = Number(before) - 1;

      for (; index >= 0 && page.length < limit; index -= 1) {
        if (matches(entries[index]!)) {
          page.unshift(toSourceEntry(index));
        }
      }

      return { entries: page, done: index < 0 };
    },
    readAfter: async ({ after, limit, matches, until }) => {
      const page: LogSourceEntry[] = [];
      let index = Number(after);

      for (; index < Number(until) && page.length < limit; index += 1) {
        if (matches(entries[index]!)) {
          page.push(toSourceEntry(index));
        }
      }

      return { entries: page, done: index >= Number(until) };
    },
  };

  return {
    lifecycle,
    source,
    push: (...newEntries: LogEntry[]) => {
      const from = entries.length;
      entries.push(...newEntries);

      if (listener) {
        livePosition = entries.length;
        listener.onEntries(
          newEntries.map((_, offset) => toSourceEntry(from + offset)),
          String(livePosition),
        );
      }
    },
    setStatus: (nextStatus: LogSourceStatus) => {
      status = nextStatus;
      listener?.onStatus(nextStatus);
    },
  };
}

/** A minimal system-journal-like entry for fake sources. */
export function systemEntry(
  id: string,
  timestamp: string,
  overrides: Partial<LogEntry> = {},
): LogEntry {
  return {
    id,
    timestamp,
    service: "system",
    stream: "journal",
    level: "info",
    source: "NetworkManager",
    raw: `system line ${id}`,
    origin: "server",
    ...overrides,
  };
}
