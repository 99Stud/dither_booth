import type { FileHandle } from "node:fs/promises";

import {
  KIOSK_LOG_PREFIX,
  parseKioskLogLine,
} from "@dither-booth/logging/kiosk-line";
import { PM2_LOG_RELATIVE_DIR } from "@dither-booth/shared/booth-system";
import { tryParseJson } from "@dither-booth/shared/runtime";
import { type FSWatcher, watch } from "node:fs";
import { open } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import z from "zod";

import type {
  LogEntry,
  LogService,
  LogSource,
  LogSourceEntry,
  LogSourceListener,
  LogSourceStatus,
} from "./logs.types";

import {
  LOGS_CONTINUATION_GRACE_MS,
  LOGS_MAX_JOINED_CHUNKS,
  LOGS_MAX_LINE_BYTES,
  LOGS_POLL_INTERVAL_MS,
  LOGS_READ_CHUNK_BYTES,
  LOG_SERVICES,
} from "./logs.constants";
import { InvalidLogPositionError } from "./logs.hub";

/*
 * A log source over one PM2 combined file (`logs/pm2/<process>.log`). Each
 * file line is one PM2 JSON envelope; its `message` holds one or more
 * output lines, each one entry. PM2 writes one envelope per chunk it reads,
 * so a long output line can be cut across envelopes: a *record* is an
 * envelope plus the envelopes that continue its last line (next in the
 * file, same `type`, the one before not ending in a newline), read as one.
 *
 * Position: `<generation>:<byte offset of a record>:<entry index in it>`.
 * The generation is a hash of the file's first line, so a position from
 * before a copy-and-truncate rotation is recognised even once the new file
 * has grown past it.
 */

type Pm2Service = Exclude<LogService, "system">;

/** The PM2 process of each service, as `pm2.config.js` names them. */
export type Pm2ProcessNames = Record<Pm2Service, string>;

type Pm2Position = { generation: string; offset: number; index: number };

type FileLine = { bytes: Buffer; start: number; end: number };

type ParsedFileLine = {
  start: number;
  end: number;
  text: string;
  envelope?: z.infer<typeof pm2EnvelopeSchema>;
};

/** File lines read as one: an envelope and those that continue it. */
type Pm2Record = {
  lines: ParsedFileLine[];
  start: number;
  end: number;
  /** It ends the read, cut mid-line: the next envelope may continue it. */
  isOpen: boolean;
};

const GENERATION_PROBE_BYTES = 4096;
const EPOCH = new Date(0).toISOString();

const pm2EnvelopeSchema = z.object({
  message: z.string(),
  timestamp: z.string(),
  type: z.enum(["out", "err"]),
});

function formatPosition({ generation, index, offset }: Pm2Position) {
  return `${generation}:${offset}:${index}`;
}

function parsePosition(position: string): Pm2Position {
  const match = /^([0-9a-z]*):(\d+):(\d+)$/.exec(position);

  if (!match) {
    throw new InvalidLogPositionError(position);
  }

  return {
    generation: match[1]!,
    offset: Number(match[2]),
    index: Number(match[3]),
  };
}

/** A generation is unknown (`""`) until the file has a complete first line. */
function isSameGeneration(a: string, b: string) {
  return a === "" || b === "" || a === b;
}

function toIsoTimestamp(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  const time = Date.parse(value);

  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

/**
 * Folds indented lines into the plain-text line before them, so a crash's
 * stack trace reads as one entry. Kiosk lines are one line each and never
 * take continuations.
 */
function joinContinuationLines(lines: string[]): string[] {
  const joined: string[] = [];

  for (const line of lines) {
    const previous = joined.at(-1);

    if (
      previous !== undefined &&
      /^\s/.test(line) &&
      !previous.startsWith(KIOSK_LOG_PREFIX)
    ) {
      joined[joined.length - 1] = `${previous}\n${line}`;
    } else {
      joined.push(line);
    }
  }

  return joined;
}

function parseOutputLine({
  id,
  service,
  stream,
  text,
  timestamp,
}: {
  id: string;
  service: LogService;
  stream: "err" | "out";
  text: string;
  timestamp: string;
}): LogEntry {
  const data = parseKioskLogLine(text);

  if (data) {
    return {
      id,
      timestamp: toIsoTimestamp(data.loggedAt) ?? timestamp,
      service,
      stream,
      level: data.level,
      source: data.source,
      event: data.event,
      ...(data.details ? { details: data.details } : {}),
      ...(data.error ? { error: data.error } : {}),
      raw: text,
      origin: data.origin ?? "server",
      ...(data.deviceId ? { deviceId: data.deviceId } : {}),
      ...(data.runId !== undefined ? { runId: data.runId } : {}),
    };
  }

  return {
    id,
    timestamp,
    service,
    stream,
    level: stream === "err" ? "error" : "info",
    raw: text,
    origin: "server",
  };
}

function parseFileLine(line: FileLine): ParsedFileLine {
  const text = line.bytes.toString("utf8");
  const envelope = pm2EnvelopeSchema.safeParse(tryParseJson(text));

  return {
    start: line.start,
    end: line.end,
    text,
    ...(envelope.success ? { envelope: envelope.data } : {}),
  };
}

/** Whether `line` was cut mid-line: the next envelope may continue it. */
function isCut(line: ParsedFileLine) {
  return line.envelope !== undefined && !line.envelope.message.endsWith("\n");
}

/** Whether `next` carries on the output line `previous` was cut in. */
function continues(previous: ParsedFileLine, next: ParsedFileLine) {
  return isCut(previous) && previous.envelope!.type === next.envelope?.type;
}

function toRecord(lines: ParsedFileLine[], isOpen = false): Pm2Record {
  return { lines, start: lines[0]!.start, end: lines.at(-1)!.end, isOpen };
}

/**
 * The entries of one record: its envelopes' messages joined, then split on
 * newlines, blank lines dropped. A line that isn't an envelope is one plain
 * entry.
 */
function parsePm2Record({
  generation,
  record,
  service,
}: {
  generation: string;
  record: Pm2Record;
  service: LogService;
}): LogEntry[] {
  const first = record.lines[0]!;
  const idOf = (index: number) =>
    `${service}:${generation}:${record.start}:${index}`;

  if (!first.envelope) {
    return first.text.trim() === ""
      ? []
      : [
          parseOutputLine({
            id: idOf(0),
            service,
            stream: "out",
            text: first.text,
            timestamp: EPOCH,
          }),
        ];
  }

  const { type } = first.envelope;
  const timestamp = toIsoTimestamp(first.envelope.timestamp) ?? EPOCH;
  const message = record.lines
    .map((line) => line.envelope?.message ?? "")
    .join("");

  return joinContinuationLines(
    message
      .split("\n")
      .map((text) => text.replace(/\r$/, ""))
      .filter((text) => text.trim() !== ""),
  ).map((text, index) =>
    parseOutputLine({
      id: idOf(index),
      service,
      stream: type,
      text,
      timestamp,
    }),
  );
}

/** Complete lines in `[from, until)`, oldest first. */
async function* readLinesForward(
  handle: FileHandle,
  from: number,
  until: number,
): AsyncGenerator<FileLine> {
  const chunk = Buffer.alloc(LOGS_READ_CHUNK_BYTES);
  // The start of the line being assembled, cut to the line cap.
  let carry = Buffer.alloc(0);
  let lineStart = from;
  let position = from;

  while (position < until) {
    const { bytesRead } = await handle.read(
      chunk,
      0,
      Math.min(chunk.length, until - position),
      position,
    );

    if (bytesRead === 0) {
      return;
    }

    const buffer = Buffer.concat([carry, chunk.subarray(0, bytesRead)]);
    let segmentStart = 0;
    let newline = buffer.indexOf(10, carry.length);

    while (newline !== -1) {
      const end = position + (newline - carry.length) + 1;
      yield {
        bytes: buffer.subarray(
          segmentStart,
          Math.min(newline, segmentStart + LOGS_MAX_LINE_BYTES),
        ),
        start: lineStart,
        end,
      };
      lineStart = end;
      segmentStart = newline + 1;
      newline = buffer.indexOf(10, segmentStart);
    }

    carry = buffer.subarray(segmentStart).subarray(0, LOGS_MAX_LINE_BYTES);
    position += bytesRead;
  }
}

/**
 * Lines ending at or before `before`, newest first. `before` must be a line
 * start: 0 or just past a newline.
 */
async function* readLinesBackward(
  handle: FileHandle,
  before: number,
): AsyncGenerator<FileLine> {
  const chunk = Buffer.alloc(LOGS_READ_CHUNK_BYTES);
  // The earliest known bytes of the line being assembled, without its
  // newline, cut to the line cap.
  let carry = Buffer.alloc(0);
  let lineEnd = before;
  let position = before;
  let isFirstChunk = true;

  while (position > 0) {
    const length = Math.min(chunk.length, position);
    position -= length;
    await handle.read(chunk, 0, length, position);

    const buffer = Buffer.concat([chunk.subarray(0, length), carry]);
    // The first chunk ends with the newline of the line ending at `before`.
    let contentEnd = isFirstChunk ? length - 1 : buffer.length;
    isFirstChunk = false;
    let newline = contentEnd > 0 ? buffer.lastIndexOf(10, contentEnd - 1) : -1;

    while (newline !== -1) {
      const start = position + newline + 1;
      yield {
        bytes: buffer.subarray(
          newline + 1,
          Math.min(contentEnd, newline + 1 + LOGS_MAX_LINE_BYTES),
        ),
        start,
        end: lineEnd,
      };
      lineEnd = start;
      contentEnd = newline;
      newline = contentEnd > 0 ? buffer.lastIndexOf(10, contentEnd - 1) : -1;
    }

    carry = buffer.subarray(0, contentEnd).subarray(0, LOGS_MAX_LINE_BYTES);
  }

  if (lineEnd > 0) {
    yield { bytes: carry, start: 0, end: lineEnd };
  }
}

/*
 * A run of continued envelopes longer than `LOGS_MAX_JOINED_CHUNKS` isn't
 * joined at all, so reading forward and backward cut the same records.
 */

/** Records starting in `[from, until)`, oldest first. */
async function* readRecordsForward(
  handle: FileHandle,
  from: number,
  until: number,
): AsyncGenerator<Pm2Record> {
  let run: ParsedFileLine[] = [];
  let isRunTooLong = false;
  let previous: ParsedFileLine | undefined;

  for await (const fileLine of readLinesForward(handle, from, until)) {
    const line = parseFileLine(fileLine);
    const isContinuation = previous !== undefined && continues(previous, line);
    previous = line;

    if (!isContinuation) {
      if (run.length > 0) {
        yield toRecord(run);
      }

      run = [];
      isRunTooLong = false;
    }

    if (isRunTooLong) {
      yield toRecord([line]);
      continue;
    }

    run.push(line);

    if (run.length > LOGS_MAX_JOINED_CHUNKS) {
      for (const runLine of run) {
        yield toRecord([runLine]);
      }

      run = [];
      isRunTooLong = true;
    }
  }

  if (run.length > 0) {
    yield toRecord(run, isCut(run.at(-1)!));
  }
}

/** Records ending at or before `before`, newest first. */
async function* readRecordsBackward(
  handle: FileHandle,
  before: number,
): AsyncGenerator<Pm2Record> {
  let run: ParsedFileLine[] = [];
  let isRunTooLong = false;
  let next: ParsedFileLine | undefined;

  for await (const fileLine of readLinesBackward(handle, before)) {
    const line = parseFileLine(fileLine);
    const isContinued = next !== undefined && continues(line, next);
    next = line;

    if (!isContinued) {
      if (run.length > 0) {
        yield toRecord(run);
      }

      run = [];
      isRunTooLong = false;
    }

    if (isRunTooLong) {
      yield toRecord([line]);
      continue;
    }

    run.unshift(line);

    if (run.length > LOGS_MAX_JOINED_CHUNKS) {
      for (const runLine of run.toReversed()) {
        yield toRecord([runLine]);
      }

      run = [];
      isRunTooLong = true;
    }
  }

  if (run.length > 0) {
    yield toRecord(run);
  }
}

async function openIfExists(filePath: string) {
  try {
    return await open(filePath, "r");
  } catch {
    return undefined;
  }
}

/** Hash of the first complete line, or `""` if there is none yet. */
async function readGeneration(handle: FileHandle) {
  const probe = Buffer.alloc(GENERATION_PROBE_BYTES);
  const { bytesRead } = await handle.read(probe, 0, probe.length, 0);
  const newline = probe.indexOf(10);

  if (newline === -1 || newline >= bytesRead) {
    return bytesRead === probe.length ? Bun.hash(probe).toString(36) : "";
  }

  return Bun.hash(probe.subarray(0, newline)).toString(36);
}

/** The end of the last complete line at or before `size`. */
async function findLineAlignedEnd(handle: FileHandle, size: number) {
  const chunk = Buffer.alloc(LOGS_READ_CHUNK_BYTES);
  let position = size;

  while (position > 0) {
    const length = Math.min(chunk.length, position);
    position -= length;
    await handle.read(chunk, 0, length, position);
    const newline = chunk.subarray(0, length).lastIndexOf(10);

    if (newline !== -1) {
      return position + newline + 1;
    }
  }

  return 0;
}

/**
 * Whether `record` ends cut mid-line, written less than `graceMs` ago: the
 * rest of its line is likely on its way.
 */
function isAwaitingRest(record: Pm2Record, graceMs: number) {
  const last = record.lines.at(-1)!;

  if (!isCut(last)) {
    return false;
  }

  const age = Date.now() - Date.parse(last.envelope!.timestamp);

  return Math.abs(age) < graceMs;
}

/**
 * Where following starts in a file of `size` bytes: the end of its last
 * complete line, or the start of a record just cut there, to read it whole
 * once the rest is written.
 */
async function findLiveStart(
  handle: FileHandle,
  size: number,
  graceMs: number,
) {
  const end = await findLineAlignedEnd(handle, size);

  for await (const record of readRecordsBackward(handle, end)) {
    return isAwaitingRest(record, graceMs) ? record.start : end;
  }

  return end;
}

function toSourceEntries(
  entries: LogEntry[],
  record: Pm2Record,
  generation: string,
): LogSourceEntry[] {
  return entries.map((entry, index) => ({
    entry,
    start: formatPosition({ generation, offset: record.start, index }),
    end:
      index + 1 < entries.length
        ? formatPosition({ generation, offset: record.start, index: index + 1 })
        : formatPosition({ generation, offset: record.end, index: 0 }),
  }));
}

/** Follows and pages one PM2 combined log file. */
export function createPm2LogSource({
  continuationGraceMs = LOGS_CONTINUATION_GRACE_MS,
  filePath,
  pollIntervalMs = LOGS_POLL_INTERVAL_MS,
  service,
}: {
  /** How long a cut line at the end waits for the envelope continuing it. */
  continuationGraceMs?: number;
  filePath: string;
  pollIntervalMs?: number;
  service: Pm2Service;
}): LogSource {
  const fileLabel = `${PM2_LOG_RELATIVE_DIR}/${basename(filePath)}`;
  const availableStatus: LogSourceStatus = {
    state: "available",
    message: `Reading ${fileLabel}.`,
  };
  const unavailableStatus: LogSourceStatus = {
    state: "unavailable",
    message: `No log file at ${fileLabel}. Is it running under PM2?`,
  };

  let listener: LogSourceListener | undefined;
  let status = unavailableStatus;
  let generation = "";
  let offset = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let watcher: FSWatcher | undefined;
  let reading: Promise<void> | undefined;
  let readAgain = false;

  const parseRecord = (record: Pm2Record, recordGeneration: string) =>
    toSourceEntries(
      parsePm2Record({ generation: recordGeneration, record, service }),
      record,
      recordGeneration,
    );

  const setStatus = (next: LogSourceStatus) => {
    status = next.state === "rotated" ? availableStatus : next;
    listener?.onStatus(next);
  };

  const readNewLines = async () => {
    const handle = await openIfExists(filePath);

    if (!handle) {
      if (status.state !== "unavailable") {
        offset = 0;
        generation = "";
        setStatus(unavailableStatus);
      }

      return;
    }

    try {
      if (status.state === "unavailable") {
        offset = 0;
        generation = "";
        setStatus(availableStatus);
      }

      const { size } = await handle.stat();

      if (size === offset) {
        return;
      }

      const currentGeneration = await readGeneration(handle);
      const rotated =
        size < offset || !isSameGeneration(generation, currentGeneration);

      if (rotated) {
        offset = 0;
        generation = currentGeneration;
        setStatus({
          state: "rotated",
          message: `${fileLabel} was rotated. Reading it from the start.`,
        });
      } else if (generation === "") {
        generation = currentGeneration;
      }

      let batch: LogSourceEntry[] = [];

      for await (const record of readRecordsForward(handle, offset, size)) {
        // Read it whole on a later tick, once its next chunk is written.
        if (record.isOpen && isAwaitingRest(record, continuationGraceMs)) {
          break;
        }

        batch.push(...parseRecord(record, generation));
        offset = record.end;

        if (batch.length >= 500) {
          listener?.onEntries(
            batch,
            formatPosition({ generation, offset, index: 0 }),
          );
          batch = [];
        }
      }

      listener?.onEntries(
        batch,
        formatPosition({ generation, offset, index: 0 }),
      );
    } finally {
      await handle.close();
    }
  };

  const tick = () => {
    if (!listener) {
      return;
    }

    if (reading) {
      readAgain = true;
      return;
    }

    reading = (async () => {
      do {
        readAgain = false;
        await readNewLines().catch(() => {
          // A failed read is retried on the next tick.
        });
      } while (readAgain && listener);
    })().finally(() => {
      reading = undefined;
    });
  };

  return {
    service,
    start: async (nextListener) => {
      const handle = await openIfExists(filePath);

      if (handle) {
        try {
          const { size } = await handle.stat();
          generation = await readGeneration(handle);
          offset = await findLiveStart(handle, size, continuationGraceMs);
          status = availableStatus;
        } finally {
          await handle.close();
        }
      } else {
        generation = "";
        offset = 0;
        status = unavailableStatus;
      }

      listener = nextListener;
      timer = setInterval(tick, pollIntervalMs);

      try {
        watcher = watch(dirname(filePath), (_event, fileName) => {
          if (fileName === basename(filePath)) {
            tick();
          }
        });
        watcher.on("error", () => {
          watcher?.close();
          watcher = undefined;
        });
      } catch {
        // No folder yet: polling picks the file up once it appears.
      }
    },
    stop: async () => {
      listener = undefined;
      clearInterval(timer);
      watcher?.close();
      watcher = undefined;
      await reading;
    },
    getLivePosition: () => formatPosition({ generation, offset, index: 0 }),
    getStatus: () => status,
    readBefore: async ({ before, limit, matches }) => {
      const position = parsePosition(before);
      const handle = await openIfExists(filePath);

      if (!handle) {
        return { entries: [], done: true };
      }

      try {
        const { size } = await handle.stat();
        const fileGeneration = await readGeneration(handle);

        // Older history was in the rotated file, which isn't searched.
        if (
          position.offset > size ||
          !isSameGeneration(position.generation, fileGeneration)
        ) {
          return { entries: [], done: true };
        }

        const page: LogSourceEntry[] = [];
        const take = (entries: LogSourceEntry[]) => {
          for (const item of entries.toReversed()) {
            if (page.length >= limit) {
              return;
            }

            if (matches(item.entry)) {
              page.unshift(item);
            }
          }
        };

        if (position.index > 0) {
          for await (const record of readRecordsForward(
            handle,
            position.offset,
            size,
          )) {
            take(parseRecord(record, fileGeneration).slice(0, position.index));
            break;
          }
        }

        for await (const record of readRecordsBackward(
          handle,
          position.offset,
        )) {
          if (page.length >= limit) {
            return { entries: page, done: false };
          }

          take(parseRecord(record, fileGeneration));
        }

        const oldest = page[0];
        const reachedStart =
          page.length < limit ||
          (oldest !== undefined &&
            parsePosition(oldest.start).offset === 0 &&
            parsePosition(oldest.start).index === 0);

        return { entries: page, done: reachedStart };
      } finally {
        await handle.close();
      }
    },
    readAfter: async ({ after, limit, matches, until }) => {
      const from = parsePosition(after);
      const to = parsePosition(until);
      const handle = await openIfExists(filePath);

      if (!handle) {
        return { entries: [], done: true };
      }

      try {
        const { size } = await handle.stat();
        const fileGeneration = await readGeneration(handle);
        const rotated =
          from.offset > size ||
          !isSameGeneration(from.generation, fileGeneration);
        const start = rotated ? { offset: 0, index: 0 } : from;
        const page: LogSourceEntry[] = [];

        for await (const record of readRecordsForward(
          handle,
          start.offset,
          size,
        )) {
          if (
            record.start > to.offset ||
            (record.start === to.offset && to.index === 0)
          ) {
            break;
          }

          const entries = parseRecord(record, fileGeneration);

          for (const [index, item] of entries.entries()) {
            if (record.start === start.offset && index < start.index) {
              continue;
            }

            if (record.start === to.offset && index >= to.index) {
              break;
            }

            if (page.length >= limit) {
              return { entries: page, done: false, rotated };
            }

            if (matches(item.entry)) {
              page.push(item);
            }
          }
        }

        return { entries: page, done: true, rotated };
      } finally {
        await handle.close();
      }
    },
  };
}

const pm2ProcessNamesSchema = z.object({
  engine: z.string().trim().min(1),
  shutter: z.string().trim().min(1),
  admin: z.string().trim().min(1),
});

/**
 * Each service's PM2 process, read from `PM2_PROCESS_NAMES` in the repo's
 * `pm2.config.js`, the one place they are named.
 */
export async function readPm2ProcessNames(
  repoRoot: string,
): Promise<Pm2ProcessNames> {
  const config = (await import(
    pathToFileURL(join(repoRoot, "pm2.config.js")).href
  )) as { PM2_PROCESS_NAMES?: unknown };

  return pm2ProcessNamesSchema.parse(config.PM2_PROCESS_NAMES);
}

/** One source per PM2 process, reading `<logDir>/<process>.log`. */
export function createPm2LogSources({
  continuationGraceMs,
  logDir,
  pollIntervalMs,
  processNames,
}: {
  continuationGraceMs?: number;
  logDir: string;
  pollIntervalMs?: number;
  processNames: Pm2ProcessNames;
}): LogSource[] {
  const services = LOG_SERVICES.filter(
    (service): service is Pm2Service => service !== "system",
  );

  return services.map((service) =>
    createPm2LogSource({
      continuationGraceMs,
      filePath: join(logDir, `${processNames[service]}.log`),
      pollIntervalMs,
      service,
    }),
  );
}
