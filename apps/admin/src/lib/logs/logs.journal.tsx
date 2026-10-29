import { tryParseJson } from "@dither-booth/shared/runtime";
import z from "zod";

import type {
  LogEntry,
  LogLevel,
  LogSource,
  LogSourceEntry,
  LogSourceListener,
  LogSourceStatus,
} from "./logs.types";

import {
  LOGS_JOURNAL_RESTART_DELAY_MS,
  LOGS_JOURNAL_UNITS,
} from "./logs.constants";
import { InvalidLogPositionError } from "./logs.hub";

/*
 * The `system` log source: the system journal, read with
 * `journalctl --output=json`, matching the booth's units and the kernel.
 * One `journalctl --follow` follows new lines; each history page is one
 * short-lived `journalctl`, killed once the page is full.
 *
 * Position: `head` (before the first entry), or `a:<realtime µs>:<cursor>`
 * (just after the entry with that `__CURSOR`) or `b:<realtime µs>:<cursor>`
 * (just before it). The realtime bounds forward reads with `--until`.
 */

/** A `journalctl` process: what the source needs of `Bun.spawn`'s result. */
export type JournalProcess = {
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  exited: Promise<number>;
  kill: () => void;
};

/** Runs `journalctl` with these args (no shell). Throws if it can't start. */
export type SpawnJournal = (args: string[]) => JournalProcess;

type JournalPosition =
  | { kind: "head" }
  | { kind: "after" | "before"; realtimeUs: string; cursor: string };

const HEAD_POSITION = "head";
const POSITION_PATTERN =
  /^([ab]):(\d+):([a-z]=[0-9a-f]+(?:;[a-z]=[0-9a-f]+)*)$/;

const COMMON_ARGS = ["--output=json", "--no-pager"];

/**
 * The booth's units (`_SYSTEMD_UNIT`), systemd's messages about them
 * (`UNIT`), the `booth` CLI wherever it runs (the update and rollback
 * units are named by version, and a match takes no wildcard) and the
 * kernel. `+` ORs the groups; values of one field are ORed already.
 * (`--unit` would AND with the kernel match.)
 */
const JOURNAL_MATCHES = [
  ...LOGS_JOURNAL_UNITS.map((unit) => `_SYSTEMD_UNIT=${unit}`),
  "+",
  ...LOGS_JOURNAL_UNITS.map((unit) => `UNIT=${unit}`),
  "+",
  "SYSLOG_IDENTIFIER=booth",
  "+",
  "_TRANSPORT=kernel",
];

const PERMISSION_HINTS = [
  "insufficient permissions",
  "not seeing messages from other users",
];

const AVAILABLE_STATUS: LogSourceStatus = {
  state: "available",
  message: `Reading the system journal: ${LOGS_JOURNAL_UNITS.join(", ")} and the kernel.`,
};
const MISSING_STATUS: LogSourceStatus = {
  state: "unavailable",
  message: "No journalctl on this machine: system logs are read on the booth.",
};
const NO_PERMISSION_STATUS: LogSourceStatus = {
  state: "unavailable",
  message:
    "No permission to read the system journal. Run `sudo booth service` (it adds pi to systemd-journal), then restart the booth.",
};
const STOPPED_STATUS: LogSourceStatus = {
  state: "unavailable",
  message: "journalctl stopped. Starting it again.",
};

const spawnJournalctl: SpawnJournal = (args) =>
  Bun.spawn(["journalctl", ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

function formatPosition(kind: "a" | "b", line: JournalLine) {
  return `${kind}:${line.realtimeUs}:${line.cursor}`;
}

function parsePosition(position: string): JournalPosition {
  if (position === HEAD_POSITION) {
    return { kind: "head" };
  }

  const match = POSITION_PATTERN.exec(position);

  if (!match) {
    throw new InvalidLogPositionError(position);
  }

  return {
    kind: match[1] === "a" ? "after" : "before",
    realtimeUs: match[2]!,
    cursor: match[3]!,
  };
}

function toSourceEntry(line: JournalLine): LogSourceEntry {
  return {
    entry: line.entry,
    start: formatPosition("b", line),
    end: formatPosition("a", line),
  };
}

/** Complete output lines, a chunk's worth at a time. */
async function* readLines(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string[]> {
  const decoder = new TextDecoder();
  let carry = "";

  for await (const chunk of stream) {
    carry += decoder.decode(chunk, { stream: true });
    const lines = carry.split("\n");
    carry = lines.pop()!;

    if (lines.length > 0) {
      yield lines;
    }
  }

  carry += decoder.decode();

  if (carry.trim() !== "") {
    yield [carry];
  }
}

function parseLines(lines: string[]) {
  return lines.flatMap((line) => parseJournalLine(line) ?? []);
}

/** Follows and pages the system journal as the `system` service. */
export function createJournalLogSource({
  restartDelayMs = LOGS_JOURNAL_RESTART_DELAY_MS,
  spawn = spawnJournalctl,
}: {
  restartDelayMs?: number;
  spawn?: SpawnJournal;
} = {}): LogSource {
  const children = new Set<JournalProcess>();
  let listener: LogSourceListener | undefined;
  let status: LogSourceStatus = MISSING_STATUS;
  /** The probe at start could run journalctl and read the system journal. */
  let readable = false;
  let livePosition = HEAD_POSITION;
  let follower: JournalProcess | undefined;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;

  const setStatus = (next: LogSourceStatus) => {
    status = next;
    listener?.onStatus(next);
  };

  const launch = (args: string[]) => {
    const child = spawn([...COMMON_ARGS, ...args, ...JOURNAL_MATCHES]);
    children.add(child);
    void child.exited.then(() => children.delete(child));

    return child;
  };

  /**
   * Runs one `journalctl` and hands `take` each entry until it returns
   * false; then kills it. Resolves true if the output ran out first.
   */
  const read = async (args: string[], take: (line: JournalLine) => boolean) => {
    const child = launch(args);
    const stderr = new Response(child.stderr).text();
    let stopped = false;

    try {
      reading: for await (const lines of readLines(child.stdout)) {
        for (const line of parseLines(lines)) {
          if (!take(line)) {
            stopped = true;
            break reading;
          }
        }
      }
    } finally {
      if (stopped) {
        child.kill();
      }
    }

    if (stopped) {
      return false;
    }

    const code = await child.exited;

    if (code !== 0) {
      const message = (await stderr).trim().split("\n")[0];
      throw new Error(message || `journalctl exited with code ${code}.`);
    }

    return true;
  };

  /** The newest matching entry, to start following after it. */
  const probe = async (): Promise<LogSourceStatus> => {
    let child: JournalProcess;

    try {
      child = launch(["--reverse", "--lines=1"]);
    } catch {
      return MISSING_STATUS;
    }

    const stderr = new Response(child.stderr).text();
    let newest: JournalLine | undefined;

    for await (const lines of readLines(child.stdout)) {
      newest ??= parseLines(lines)[0];
    }

    const code = await child.exited;
    const errorText = (await stderr).trim();

    if (PERMISSION_HINTS.some((hint) => errorText.includes(hint))) {
      return NO_PERMISSION_STATUS;
    }

    if (code !== 0) {
      return {
        state: "unavailable",
        message:
          errorText.split("\n")[0] || `journalctl exited with code ${code}.`,
      };
    }

    livePosition = newest ? formatPosition("a", newest) : HEAD_POSITION;
    return AVAILABLE_STATUS;
  };

  const scheduleRestart = () => {
    restartTimer ??= setTimeout(() => {
      restartTimer = undefined;

      if (listener) {
        follow();
      }
    }, restartDelayMs);
  };

  const follow = () => {
    const position = parsePosition(livePosition);
    let child: JournalProcess;

    try {
      child = launch([
        "--follow",
        "--lines=all",
        ...(position.kind === "head"
          ? []
          : [`--after-cursor=${position.cursor}`]),
      ]);
    } catch {
      setStatus(STOPPED_STATUS);
      scheduleRestart();
      return;
    }

    follower = child;
    void new Response(child.stderr).text();

    if (status.state !== "available") {
      setStatus(AVAILABLE_STATUS);
    }

    void (async () => {
      try {
        for await (const lines of readLines(child.stdout)) {
          const items = parseLines(lines).map(toSourceEntry);

          if (follower !== child || items.length === 0) {
            continue;
          }

          livePosition = items.at(-1)!.end;
          listener?.onEntries(items, livePosition);
        }
      } catch {
        // Handled as an exit below.
      }

      if (follower === child && listener) {
        follower = undefined;
        setStatus(STOPPED_STATUS);
        scheduleRestart();
      }
    })();
  };

  return {
    service: "system",
    start: async (nextListener) => {
      const probed = await probe();
      readable = probed.state === "available";
      status = probed;
      listener = nextListener;

      if (readable) {
        follow();
      }
    },
    stop: async () => {
      listener = undefined;
      follower = undefined;
      clearTimeout(restartTimer);
      restartTimer = undefined;
      const running = [...children];

      for (const child of running) {
        child.kill();
      }

      await Promise.all(running.map((child) => child.exited));
    },
    getLivePosition: () => livePosition,
    getStatus: () => status,
    readBefore: async ({ before, limit, matches }) => {
      const position = parsePosition(before);

      if (position.kind === "head" || !readable) {
        return { entries: [], done: true };
      }

      const page: LogSourceEntry[] = [];
      const done = await read(
        [
          "--reverse",
          position.kind === "after"
            ? `--cursor=${position.cursor}`
            : `--after-cursor=${position.cursor}`,
        ],
        (line) => {
          const item = toSourceEntry(line);

          if (matches(item.entry)) {
            page.unshift(item);
          }

          return page.length < limit;
        },
      );

      return { entries: page, done };
    },
    readAfter: async ({ after, limit, matches, until }) => {
      const from = parsePosition(after);
      const to = parsePosition(until);

      if (to.kind === "head" || after === until || !readable) {
        return { entries: [], done: true };
      }

      const page: LogSourceEntry[] = [];
      let reachedUntil = false;
      const untilSeconds = (BigInt(to.realtimeUs) + 999_999n) / 1_000_000n;
      const complete = await read(
        [
          ...(from.kind === "head"
            ? []
            : [
                from.kind === "after"
                  ? `--after-cursor=${from.cursor}`
                  : `--cursor=${from.cursor}`,
              ]),
          `--until=@${untilSeconds}`,
        ],
        (line) => {
          if (to.kind === "before" && line.cursor === to.cursor) {
            reachedUntil = true;
            return false;
          }

          if (page.length >= limit) {
            return false;
          }

          const item = toSourceEntry(line);

          if (matches(item.entry)) {
            page.push(item);
          }

          if (line.cursor === to.cursor) {
            reachedUntil = true;
            return false;
          }

          return true;
        },
      );

      return { entries: page, done: complete || reachedUntil };
    },
  };
}

/** A journal field: text, bytes (non-UTF-8 text), several values, or null (too long). */
const journalFieldSchema = z.union([
  z.string(),
  z.array(z.number()),
  z.array(z.union([z.string(), z.array(z.number())])),
  z.null(),
]);

const journalRecordSchema = z
  .object({
    __CURSOR: z.string(),
    __REALTIME_TIMESTAMP: z.string().regex(/^\d+$/),
    MESSAGE: journalFieldSchema.optional(),
    PRIORITY: journalFieldSchema.optional(),
    _TRANSPORT: journalFieldSchema.optional(),
    _SYSTEMD_UNIT: journalFieldSchema.optional(),
    UNIT: journalFieldSchema.optional(),
    SYSLOG_IDENTIFIER: journalFieldSchema.optional(),
    _PID: journalFieldSchema.optional(),
  })
  .loose();

type JournalField = z.infer<typeof journalFieldSchema>;

export type JournalLine = {
  entry: LogEntry;
  cursor: string;
  /** `__REALTIME_TIMESTAMP`: microseconds since the epoch. */
  realtimeUs: string;
};

const textDecoder = new TextDecoder();

function fieldText(field: JournalField | undefined): string | undefined {
  if (field === undefined || field === null) {
    return undefined;
  }

  if (typeof field === "string") {
    return field;
  }

  if (field.every((item) => typeof item === "number")) {
    return textDecoder.decode(new Uint8Array(field as number[]));
  }

  // A field logged more than once: the last value wins.
  return fieldText(field.at(-1) as JournalField);
}

function levelOf(priority: string | undefined): LogLevel {
  const value = Number(priority);

  if (priority === undefined || Number.isNaN(value)) {
    return "info";
  }

  if (value <= 3) {
    return "error";
  }

  return value === 4 ? "warn" : "info";
}

/** One `journalctl --output=json` line as an entry, or undefined if it isn't a journal record. */
export function parseJournalLine(line: string): JournalLine | undefined {
  const parsed = journalRecordSchema.safeParse(tryParseJson(line));

  if (!parsed.success) {
    return undefined;
  }

  const record = parsed.data;
  const cursor = record.__CURSOR;
  const realtimeUs = record.__REALTIME_TIMESTAMP;
  const identifier = fieldText(record.SYSLOG_IDENTIFIER);
  const pid = Number(fieldText(record._PID));
  const details = {
    ...(identifier ? { identifier } : {}),
    ...(Number.isInteger(pid) && pid > 0 ? { pid } : {}),
  };
  const source =
    fieldText(record._TRANSPORT) === "kernel"
      ? "kernel"
      : (fieldText(record.UNIT) ?? fieldText(record._SYSTEMD_UNIT));
  const message =
    record.MESSAGE === null
      ? "(message too long to show)"
      : (fieldText(record.MESSAGE) ?? "");

  return {
    cursor,
    realtimeUs,
    entry: {
      id: `system:${cursor}`,
      timestamp: new Date(Number(BigInt(realtimeUs) / 1000n)).toISOString(),
      service: "system",
      stream: "journal",
      level: levelOf(fieldText(record.PRIORITY)),
      ...(source ? { source } : {}),
      ...(Object.keys(details).length > 0 ? { details } : {}),
      raw: message,
      origin: "server",
    },
  };
}
