import type { FileHandle } from "node:fs/promises";

import { type FSWatcher, watch } from "node:fs";
import { open } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
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
  LOGS_MAX_LINE_BYTES,
  LOGS_PM2_LOG_RELATIVE_DIR,
  LOGS_PM2_PROCESS_NAMES,
  LOGS_POLL_INTERVAL_MS,
  LOGS_READ_CHUNK_BYTES,
} from "./logs.constants";
import { InvalidLogPositionError } from "./logs.hub";
import { logEntryErrorSchema, logLevelSchema } from "./logs.protocol";

/*
 * A log source over one PM2 combined file (`logs/pm2/<process>.log`). Each
 * file line is one PM2 JSON envelope; its `message` holds one or more
 * output lines, each one entry.
 *
 * Position: `<generation>:<byte offset of a file line>:<entry index in it>`.
 * The generation is a hash of the file's first line, so a position from
 * before a copy-and-truncate rotation is recognised even once the new file
 * has grown past it.
 */

type Pm2Service = keyof typeof LOGS_PM2_PROCESS_NAMES;

type Pm2Position = { generation: string; offset: number; index: number };

type FileLine = { bytes: Buffer; start: number; end: number };

const KIOSK_PREFIX = "[kiosk] ";
const GENERATION_PROBE_BYTES = 4096;
const EPOCH = new Date(0).toISOString();

const pm2EnvelopeSchema = z.object({
  message: z.string(),
  timestamp: z.string(),
  type: z.enum(["out", "err"]),
});

const kioskPayloadSchema = z.object({
  loggedAt: z.string().optional(),
  level: logLevelSchema,
  source: z.string(),
  event: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  error: logEntryErrorSchema.optional(),
  origin: z.literal("browser").optional(),
  deviceId: z.string().optional(),
  runId: z.number().optional(),
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

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
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
  if (text.startsWith(KIOSK_PREFIX)) {
    const payload = kioskPayloadSchema.safeParse(
      parseJson(text.slice(KIOSK_PREFIX.length)),
    );

    if (payload.success) {
      const { data } = payload;

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

/**
 * The entries of one file line: its envelope's message split on newlines,
 * blank lines dropped. A line that isn't an envelope is one plain entry.
 */
export function parsePm2FileLine({
  generation,
  line,
  offset,
  service,
}: {
  generation: string;
  line: string;
  offset: number;
  service: LogService;
}): LogEntry[] {
  const envelope = pm2EnvelopeSchema.safeParse(parseJson(line));
  const idOf = (index: number) => `${service}:${generation}:${offset}:${index}`;

  if (!envelope.success) {
    return line.trim() === ""
      ? []
      : [
          parseOutputLine({
            id: idOf(0),
            service,
            stream: "out",
            text: line,
            timestamp: EPOCH,
          }),
        ];
  }

  const { message, type } = envelope.data;
  const timestamp = toIsoTimestamp(envelope.data.timestamp) ?? EPOCH;

  return message
    .split("\n")
    .map((text) => text.replace(/\r$/, ""))
    .filter((text) => text.trim() !== "")
    .map((text, index) =>
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

function toSourceEntries(
  entries: LogEntry[],
  line: FileLine,
  generation: string,
): LogSourceEntry[] {
  return entries.map((entry, index) => ({
    entry,
    start: formatPosition({ generation, offset: line.start, index }),
    end:
      index + 1 < entries.length
        ? formatPosition({ generation, offset: line.start, index: index + 1 })
        : formatPosition({ generation, offset: line.end, index: 0 }),
  }));
}

/** Follows and pages one PM2 combined log file. */
export function createPm2LogSource({
  filePath,
  pollIntervalMs = LOGS_POLL_INTERVAL_MS,
  service,
}: {
  filePath: string;
  pollIntervalMs?: number;
  service: Pm2Service;
}): LogSource {
  const fileLabel = `${LOGS_PM2_LOG_RELATIVE_DIR}/${basename(filePath)}`;
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

  const parseLine = (line: FileLine, lineGeneration: string) =>
    toSourceEntries(
      parsePm2FileLine({
        generation: lineGeneration,
        line: line.bytes.toString("utf8"),
        offset: line.start,
        service,
      }),
      line,
      lineGeneration,
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

      for await (const line of readLinesForward(handle, offset, size)) {
        batch.push(...parseLine(line, generation));
        offset = line.end;

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
          offset = await findLineAlignedEnd(handle, size);
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
          for await (const line of readLinesForward(
            handle,
            position.offset,
            size,
          )) {
            take(parseLine(line, fileGeneration).slice(0, position.index));
            break;
          }
        }

        for await (const line of readLinesBackward(handle, position.offset)) {
          if (page.length >= limit) {
            return { entries: page, done: false };
          }

          take(parseLine(line, fileGeneration));
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

        for await (const line of readLinesForward(handle, start.offset, size)) {
          if (
            line.start > to.offset ||
            (line.start === to.offset && to.index === 0)
          ) {
            break;
          }

          const entries = parseLine(line, fileGeneration);

          for (const [index, item] of entries.entries()) {
            if (line.start === start.offset && index < start.index) {
              continue;
            }

            if (line.start === to.offset && index >= to.index) {
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

/** One source per PM2 process, reading `<logDir>/<process>.log`. */
export function createPm2LogSources({
  logDir,
  pollIntervalMs,
}: {
  logDir: string;
  pollIntervalMs?: number;
}): LogSource[] {
  return (Object.keys(LOGS_PM2_PROCESS_NAMES) as Pm2Service[]).map((service) =>
    createPm2LogSource({
      filePath: join(logDir, `${LOGS_PM2_PROCESS_NAMES[service]}.log`),
      pollIntervalMs,
      service,
    }),
  );
}
