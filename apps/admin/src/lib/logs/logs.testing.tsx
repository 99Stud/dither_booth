import type { BrowserServerWebSocket } from "@dither-booth/browser-server/internal/browser-server.types";

import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Pm2ProcessNames } from "./logs.pm2";

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

/** The PM2 processes the test files are named after. */
export const TEST_PM2_PROCESS_NAMES: Pm2ProcessNames = {
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
    app_name: TEST_PM2_PROCESS_NAMES[service],
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
    join(logDir, `${TEST_PM2_PROCESS_NAMES[service]}.log`);

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

/** A journal record as `journalctl --output=json` prints it. */
export function journalRecord(
  seq: number,
  timestamp: string,
  fields: Record<string, unknown> = {},
) {
  const realtimeUs = BigInt(Date.parse(timestamp)) * 1000n;

  return {
    __CURSOR: `s=0123456789abcdef0123456789abcdef;i=${seq.toString(16)};b=fedcba9876543210fedcba9876543210;m=${seq.toString(16)};t=${realtimeUs.toString(16)};x=${(seq * 7919).toString(16)}`,
    __REALTIME_TIMESTAMP: realtimeUs.toString(),
    __MONOTONIC_TIMESTAMP: String(seq),
    PRIORITY: "6",
    _TRANSPORT: "journal",
    _SYSTEMD_UNIT: "NetworkManager.service",
    SYSLOG_IDENTIFIER: "NetworkManager",
    MESSAGE: `journal line ${seq}`,
    ...fields,
  };
}

type JournalRecord = ReturnType<typeof journalRecord>;

type FakeFollower = { end: (code: number) => void; write: JournalWriter };

type JournalWriter = (record: JournalRecord) => void;

/**
 * A fake `journalctl` to inject as the journal source's `spawn`. It answers
 * from its records the way `journalctl --output=json` does (`--cursor`,
 * `--after-cursor`, `--reverse`, `--lines`, `--until=@<s>`, `--follow`).
 * Matches are ignored: every record matches. Each output line is split
 * across two chunks, as a pipe may deliver it.
 */
export function createFakeJournal({
  missing = false,
  records: initialRecords = [],
  stderr = "",
}: {
  /** Spawning throws, as `Bun.spawn` does without `journalctl` on the PATH. */
  missing?: boolean;
  records?: JournalRecord[];
  /** Printed on stderr by every process, e.g. a permission hint. */
  stderr?: string;
} = {}) {
  const records = [...initialRecords];
  const spawned: string[][] = [];
  const followers = new Set<FakeFollower>();
  const encoder = new TextEncoder();
  let running = 0;

  const valueOf = (args: string[], flag: string) =>
    args.find((arg) => arg.startsWith(`${flag}=`))?.slice(flag.length + 1);
  const indexOf = (cursor: string) =>
    records.findIndex((record) => record.__CURSOR === cursor);

  const select = (args: string[]) => {
    const follow = args.includes("--follow");
    const cursor = valueOf(args, "--cursor");
    const afterCursor = valueOf(args, "--after-cursor");
    const until = valueOf(args, "--until");
    const linesArg = valueOf(args, "--lines");
    const lines =
      linesArg === undefined || linesArg === "all"
        ? Infinity
        : Number(linesArg);

    if (args.includes("--reverse")) {
      const from =
        cursor !== undefined
          ? indexOf(cursor)
          : afterCursor !== undefined
            ? indexOf(afterCursor) - 1
            : records.length - 1;

      return records
        .slice(0, from + 1)
        .toReversed()
        .slice(0, lines);
    }

    const from =
      cursor !== undefined
        ? indexOf(cursor)
        : afterCursor !== undefined
          ? indexOf(afterCursor) + 1
          : follow && lines !== Infinity
            ? Math.max(records.length - lines, 0)
            : 0;
    const untilUs =
      until === undefined ? undefined : BigInt(until.slice(1)) * 1_000_000n;
    const selected = records
      .slice(from)
      .filter(
        (record) =>
          untilUs === undefined ||
          BigInt(record.__REALTIME_TIMESTAMP) <= untilUs,
      );

    return follow ? selected : selected.slice(0, lines);
  };

  const spawn = (args: string[]) => {
    spawned.push(args);

    if (missing) {
      throw Object.assign(
        new Error('Executable not found in $PATH: "journalctl"'),
        { code: "ENOENT" },
      );
    }

    const selected = select(args);
    let resolveExited!: (code: number) => void;
    const exited = new Promise<number>((resolve) => {
      resolveExited = resolve;
    });
    let ended = false;
    let follower: FakeFollower | undefined;
    let stdoutController!: ReadableStreamDefaultController<Uint8Array>;

    const write: JournalWriter = (record) => {
      const line = `${JSON.stringify(record)}\n`;
      const half = Math.floor(line.length / 2);
      stdoutController.enqueue(encoder.encode(line.slice(0, half)));
      stdoutController.enqueue(encoder.encode(line.slice(half)));
    };

    const end = (code: number) => {
      if (ended) {
        return;
      }

      ended = true;
      running -= 1;

      if (follower) {
        followers.delete(follower);
      }

      try {
        stdoutController.close();
      } catch {
        // Already closed or cancelled.
      }

      resolveExited(code);
    };

    running += 1;

    const stdout = new ReadableStream<Uint8Array>({
      start: (controller) => {
        stdoutController = controller;
        selected.forEach(write);

        if (args.includes("--follow")) {
          follower = { end, write };
          followers.add(follower);
        } else {
          setTimeout(() => end(0), 0);
        }
      },
      cancel: () => end(143),
    });
    const stderrStream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        if (stderr) {
          controller.enqueue(encoder.encode(stderr));
        }

        controller.close();
      },
    });

    return { stdout, stderr: stderrStream, exited, kill: () => end(143) };
  };

  return {
    spawn,
    /** The args of every spawn, in order. */
    spawned,
    /** Processes not yet exited or killed. */
    running: () => running,
    append: (...newRecords: JournalRecord[]) => {
      records.push(...newRecords);

      for (const { write } of followers) {
        newRecords.forEach(write);
      }
    },
    /** Every `--follow` process exits, as if journalctl died. */
    endFollowers: (code = 1) => {
      for (const { end } of [...followers]) {
        end(code);
      }
    },
  };
}
