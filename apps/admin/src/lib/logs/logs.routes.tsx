import type {
  BrowserServerWebSocket,
  BrowserServerWebSocketMessage,
  WebSocketRouteHandler,
} from "@dither-booth/browser-server/internal/browser-server.types";

import z from "zod";

import type { LogHub, LogHubSubscription } from "./logs.hub";
import type {
  LogEntry,
  LogPositions,
  LogService,
  LogSourceStatus,
  LogsServerMessage,
} from "./logs.types";

import {
  LOGS_FELL_BEHIND_CLOSE_CODE,
  LOGS_INTERNAL_ERROR_CLOSE_CODE,
  LOGS_INVALID_CLOSE_CODE,
  LOGS_MAX_HELD_ENTRIES,
} from "./logs.constants";
import { InvalidLogPositionError } from "./logs.hub";
import { logServiceSchema, logsClientMessageSchema } from "./logs.protocol";

/*
 * `/admin/logs`: the Logs page's one way in. Every socket shares one log
 * hub. Gate access here (`validateUpgrade`) when the page is restricted.
 *
 * Cursor: the server keeps, per socket, where its history reaches back to
 * (`before`) and how far its live lines reach (`after`), and sends both,
 * encoded, with every page and append.
 */

const positionsSchema = z.partialRecord(logServiceSchema, z.string());
const cursorSchema = z.object({ b: positionsSchema, a: positionsSchema });

type Cursor = { before: LogPositions; after: LogPositions };

type HeldMessage =
  | { type: "append"; entries: LogEntry[]; positions: LogPositions }
  | { type: "status"; service: LogService; status: LogSourceStatus };

type SocketState = {
  subscription?: LogHubSubscription;
  closed: boolean;
  before: LogPositions;
  after: LogPositions;
  /** Where this socket's live lines start. */
  liveStart: LogPositions;
  /** First request was `after`: live lines wait until history catches up. */
  catchingUp: boolean;
  /** A history request is being served: live lines wait for its page. */
  busy: boolean;
  held: HeldMessage[];
  heldEntries: number;
  queue: Promise<void>;
};

function encodeCursor({ after, before }: Cursor) {
  return Buffer.from(JSON.stringify({ b: before, a: after })).toString(
    "base64url",
  );
}

function decodeCursor(cursor: string): Cursor | undefined {
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );

    return parsed.success
      ? { before: parsed.data.b, after: parsed.data.a }
      : undefined;
  } catch {
    return undefined;
  }
}

function parseMessage(message: BrowserServerWebSocketMessage) {
  try {
    const text = typeof message === "string" ? message : message.toString();
    return logsClientMessageSchema.safeParse(JSON.parse(text));
  } catch {
    return undefined;
  }
}

function send(ws: BrowserServerWebSocket, message: LogsServerMessage) {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // The socket is closing; its close handler cleans up.
  }
}

/** The socket over `hub`; the admin server builds the hub from its sources. */
export function createLogsRoute({
  hub,
  maxHeldEntries = LOGS_MAX_HELD_ENTRIES,
}: {
  hub: LogHub;
  maxHeldEntries?: number;
}): WebSocketRouteHandler {
  const sockets = new Map<BrowserServerWebSocket, SocketState>();

  const cursorOf = (state: SocketState) =>
    encodeCursor({ before: state.before, after: state.after });

  const sendStatus = (
    ws: BrowserServerWebSocket,
    service: LogService,
    status: LogSourceStatus,
  ) => {
    send(ws, { type: "source-status", service, ...status });
  };

  const reject = (ws: BrowserServerWebSocket, message: string) => {
    send(ws, { type: "error", message });
    ws.close(LOGS_INVALID_CLOSE_CODE, message);
  };

  const releaseHeld = (ws: BrowserServerWebSocket, state: SocketState) => {
    if (state.catchingUp || state.busy) {
      return;
    }

    const held = state.held;
    state.held = [];
    state.heldEntries = 0;

    for (const message of held) {
      if (message.type === "status") {
        sendStatus(ws, message.service, message.status);
        continue;
      }

      state.after = message.positions;
      send(ws, {
        type: "append",
        entries: message.entries,
        cursor: cursorOf(state),
      });
    }
  };

  const hold = (
    ws: BrowserServerWebSocket,
    state: SocketState,
    message: HeldMessage,
  ) => {
    state.held.push(message);

    if (message.type === "append") {
      state.heldEntries += message.entries.length;
    }

    if (state.heldEntries > maxHeldEntries) {
      state.held = [];
      state.heldEntries = 0;
      ws.close(
        LOGS_FELL_BEHIND_CLOSE_CODE,
        "Too many new lines while loading. Resume from the last cursor.",
      );
    }

    releaseHeld(ws, state);
  };

  const subscribe = async (ws: BrowserServerWebSocket, state: SocketState) => {
    const subscription = await hub.subscribe({
      onAppend: (entries, positions) =>
        hold(ws, state, { type: "append", entries, positions }),
      onStatus: (service, status) =>
        hold(ws, state, { type: "status", service, status }),
    });

    if (state.closed) {
      subscription.unsubscribe();
      return false;
    }

    state.subscription = subscription;
    state.before = subscription.positions;
    state.after = subscription.positions;
    state.liveStart = subscription.positions;

    for (const { service, status } of subscription.statuses) {
      sendStatus(ws, service, status);
    }

    return true;
  };

  const handleMessage = async (
    ws: BrowserServerWebSocket,
    state: SocketState,
    message: BrowserServerWebSocketMessage,
  ) => {
    const parsed = parseMessage(message);

    if (!parsed?.success) {
      reject(ws, "Invalid logs request.");
      return;
    }

    const request = parsed.data;
    const cursorText = request.before ?? request.after;
    const cursor = cursorText ? decodeCursor(cursorText) : undefined;

    if (cursorText && !cursor) {
      reject(ws, "Invalid logs cursor.");
      return;
    }

    state.busy = true;

    try {
      if (!state.subscription) {
        state.catchingUp = request.after !== undefined;

        if (!(await subscribe(ws, state))) {
          return;
        }
      }

      if (request.after && cursor) {
        const page = await hub.readAfter({
          filter: request.filter,
          limit: request.limit,
          positions: cursor.after,
          until: state.catchingUp ? state.liveStart : state.after,
        });

        for (const service of page.rotated) {
          sendStatus(ws, service, {
            state: "rotated",
            message: "The log file was rotated since this cursor.",
          });
        }

        state.before = cursor.before;

        if (state.catchingUp) {
          state.after = page.done ? state.liveStart : page.positions;
          state.catchingUp = !page.done;
        }

        send(ws, {
          type: "history",
          entries: page.entries,
          cursor: cursorOf(state),
          done: page.done,
        });
        return;
      }

      if (!cursor && state.catchingUp) {
        // A fresh page replaces the catch-up: live lines resume after it.
        state.after = state.liveStart;
        state.catchingUp = false;
      }

      const page = await hub.readBefore({
        filter: request.filter,
        limit: request.limit,
        positions: cursor ? cursor.before : state.after,
      });

      state.before = page.positions;
      send(ws, {
        type: "history",
        entries: page.entries,
        cursor: cursorOf(state),
        done: page.done,
      });
    } catch (error) {
      if (error instanceof InvalidLogPositionError) {
        reject(ws, "Invalid logs cursor.");
        return;
      }

      send(ws, { type: "error", message: "Could not read the logs." });
      ws.close(LOGS_INTERNAL_ERROR_CLOSE_CODE, "Could not read the logs.");
    } finally {
      state.busy = false;
      releaseHeld(ws, state);
    }
  };

  return {
    open: (ws) => {
      sockets.set(ws, {
        closed: false,
        before: {},
        after: {},
        liveStart: {},
        catchingUp: false,
        busy: false,
        held: [],
        heldEntries: 0,
        queue: Promise.resolve(),
      });
    },
    message: (ws, message) => {
      const state = sockets.get(ws);

      if (!state) {
        return;
      }

      state.queue = state.queue.then(() => handleMessage(ws, state, message));
    },
    close: (ws) => {
      const state = sockets.get(ws);

      if (!state) {
        return;
      }

      state.closed = true;
      state.subscription?.unsubscribe();
      sockets.delete(ws);
    },
  };
}
