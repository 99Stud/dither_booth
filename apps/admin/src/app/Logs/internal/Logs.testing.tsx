import { act, fireEvent } from "@testing-library/react";

import type {
  LogEntry,
  LogService,
  LogSourceState,
  LogsClientMessage,
  LogsServerMessage,
} from "#lib/logs/logs.types";

import { LOGS_LEFT_BOTTOM_GRACE_MS } from "./Logs.constants";

/*
 * Render-test helpers for the Logs page: a fake `/admin/logs` socket in
 * place of the browser's `WebSocket`, and log entries to send through it.
 */

type Listener = (event: Event) => void;

/** One socket the page opened, driven by the test as the server. */
export class FakeLogSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = FakeLogSocket.CONNECTING;
  /** What the page sent, parsed. */
  readonly requests: LogsClientMessage[] = [];
  /** Set once the page closes the socket itself. */
  closedByPage = false;
  private readonly listeners = new Map<string, Set<Listener>>();
  private cursor = 0;

  constructor(url: string | URL) {
    this.url = String(url);
  }

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: string) {
    this.requests.push(JSON.parse(data) as LogsClientMessage);
  }

  close() {
    this.closedByPage = true;
    this.readyState = FakeLogSocket.CLOSED;
  }

  private emit(type: string, event: Event) {
    act(() => {
      for (const listener of this.listeners.get(type) ?? []) {
        listener(event);
      }
    });
  }

  /** The server accepts the connection. */
  open() {
    this.readyState = FakeLogSocket.OPEN;
    this.emit("open", new Event("open"));
  }

  /** The server sends `message`. */
  receive(message: LogsServerMessage) {
    this.emit(
      "message",
      Object.assign(new Event("message"), { data: JSON.stringify(message) }),
    );
  }

  /** A history page; the cursor is made up unless given. */
  history(
    entries: LogEntry[],
    { done = true, cursor }: { done?: boolean; cursor?: string } = {},
  ) {
    this.receive({
      type: "history",
      entries,
      cursor: cursor ?? this.nextCursor(),
      done,
    });
  }

  /** Live lines, unfiltered. */
  append(entries: LogEntry[], { cursor }: { cursor?: string } = {}) {
    this.receive({
      type: "append",
      entries,
      cursor: cursor ?? this.nextCursor(),
    });
  }

  status(service: LogService, state: LogSourceState, message: string) {
    this.receive({ type: "source-status", service, state, message });
  }

  /** The connection drops, as on a Wi-Fi hiccup. */
  drop(code = 1006) {
    this.readyState = FakeLogSocket.CLOSED;
    this.emit("close", Object.assign(new Event("close"), { code }));
  }

  lastRequest() {
    return this.requests.at(-1);
  }

  private nextCursor() {
    this.cursor += 1;
    return `cursor-${this.cursor}`;
  }
}

/**
 * Replaces `WebSocket` with `FakeLogSocket` until `restore()`. `latest()` is
 * the socket the page opened last.
 */
export function installFakeLogSockets() {
  const original = globalThis.WebSocket;
  const sockets: FakeLogSocket[] = [];

  class RecordedSocket extends FakeLogSocket {
    constructor(url: string | URL) {
      super(url);
      sockets.push(this);
    }
  }

  globalThis.WebSocket = RecordedSocket as unknown as typeof WebSocket;

  return {
    sockets,
    latest: () => {
      const socket = sockets.at(-1);
      if (!socket) throw new Error("The page opened no log socket.");
      return socket;
    },
    restore: () => {
      globalThis.WebSocket = original;
    },
  };
}

/**
 * Scrolls the timeline away from its bottom, as a reader going back up.
 * happy-dom has no layout, so the scroller gets a made-up height.
 */
export async function scrollLogsUp() {
  const scroller = document.querySelector<HTMLElement>(
    "[data-virtuoso-scroller]",
  );
  if (!scroller) throw new Error("The timeline isn't showing.");

  let scrollTop = 2000;
  Object.defineProperty(scroller, "scrollHeight", {
    configurable: true,
    get: () => 4000,
  });
  Object.defineProperty(scroller, "scrollTop", {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });

  fireEvent.scroll(scroller);
  scrollTop = 200;
  fireEvent.scroll(scroller);
  // Virtuoso reports the change on a later frame, and the page waits out
  // its grace period before it counts the reader as scrolled up.
  await act(
    () =>
      new Promise((resolve) =>
        setTimeout(resolve, LOGS_LEFT_BOTTOM_GRACE_MS + 50),
      ),
  );
}

let nextEntryId = 0;

/** A structured log entry; override any field. */
export function logEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  nextEntryId += 1;
  const level = overrides.level ?? "info";
  const service = overrides.service ?? "engine";
  const timestamp =
    overrides.timestamp ??
    new Date(Date.UTC(2026, 9, 27, 14, 0, 0, nextEntryId)).toISOString();
  const source = overrides.source ?? `${service}.server`;
  const event = overrides.event ?? `event-${nextEntryId}`;

  return {
    id: `entry-${nextEntryId}`,
    timestamp,
    service,
    stream: level === "info" ? "out" : "err",
    level,
    source,
    event,
    raw: `[kiosk] ${JSON.stringify({ loggedAt: timestamp, level, source, event, details: overrides.details })}`,
    origin: "server",
    ...overrides,
  };
}
