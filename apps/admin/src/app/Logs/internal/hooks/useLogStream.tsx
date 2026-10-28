import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import type {
  LogEntry,
  LogFilter,
  LogService,
  LogSourceStatus,
} from "#lib/logs/logs.types";

import {
  LOGS_FELL_BEHIND_CLOSE_CODE,
  LOGS_INVALID_CLOSE_CODE,
  LOGS_ROUTE_PATH,
} from "#lib/logs/logs.constants";
import { logsServerMessageSchema } from "#lib/logs/logs.protocol";

import type {
  LogsConnectionState,
  LogsMarker,
  LogsTimelineItem,
} from "../Logs.types";

import {
  LOGS_FIRST_ITEM_INDEX,
  LOGS_OFFLINE_AFTER_ATTEMPTS,
  LOGS_PAGE_HISTORY_LIMIT,
  LOGS_PAGE_MAX_ENTRIES,
  LOGS_RECONNECT_FIRST_DELAY_MS,
  LOGS_RECONNECT_MAX_DELAY_MS,
} from "../Logs.constants";
import { isLogsItemVisible } from "../Logs.utils";

/*
 * The Logs page's side of the `/admin/logs` socket: the first page, live
 * lines, older pages, and reconnecting without duplicates. History arrives
 * filtered by the server; live lines arrive unfiltered and are filtered
 * here with the same predicate.
 */

type PageKind =
  /** The latest lines for a new filter: replaces the timeline. */
  | "latest"
  /** Older lines: prepended. */
  | "older"
  /** Lines missed while disconnected: appended. */
  | "resume"
  /** The latest lines after a resume was refused: appended, with a gap. */
  | "fallback";

type StreamState = {
  filter: LogFilter;
  connection: LogsConnectionState;
  /** The first page for the current filter arrived. */
  isLoaded: boolean;
  /** Every line kept, visible or not, oldest first. */
  items: LogsTimelineItem[];
  hasOlder: boolean;
  isLoadingOlder: boolean;
  /** Older lines were dropped, or can't be loaded, to stay under the cap. */
  isAtLimit: boolean;
  statuses: Partial<Record<LogService, LogSourceStatus>>;
  /** The server's last error message. */
  error?: string;
  isPaused: boolean;
  /** Lines that arrived while paused, shown on resume. */
  held: LogsTimelineItem[];
  /** Visible errors among `held`. */
  heldErrorCount: number;
  /** Virtuoso's `firstItemIndex` for the visible rows. */
  firstItemIndex: number;
  /** Visible rows added at the end since the filter last changed. */
  appendedCount: number;
};

type StreamAction =
  | { type: "reset"; filter: LogFilter }
  | { type: "connection"; connection: LogsConnectionState }
  | { type: "page"; kind: PageKind; entries: LogEntry[]; done: boolean }
  | { type: "older-requested" }
  | { type: "append"; items: LogsTimelineItem[] }
  | { type: "reconnect-settled"; id: string; state: "complete" | "gap" }
  | { type: "status"; service: LogService; status: LogSourceStatus }
  | { type: "error"; message: string | undefined }
  | { type: "pause"; isPaused: boolean };

const toItem = (entry: LogEntry): LogsTimelineItem => ({
  kind: "entry",
  id: entry.id,
  entry,
});

const initialState = (filter: LogFilter): StreamState => ({
  filter,
  connection: "connecting",
  isLoaded: false,
  items: [],
  hasOlder: true,
  isLoadingOlder: false,
  isAtLimit: false,
  statuses: {},
  isPaused: false,
  held: [],
  heldErrorCount: 0,
  firstItemIndex: LOGS_FIRST_ITEM_INDEX,
  appendedCount: 0,
});

const withoutKnown = (items: LogsTimelineItem[], known: LogsTimelineItem[]) => {
  const ids = new Set(known.map((item) => item.id));
  return items.filter((item) => !ids.has(item.id));
};

const countVisible = (items: LogsTimelineItem[], filter: LogFilter) =>
  items.filter((item) => isLogsItemVisible(item, filter)).length;

/** Appends `added`, dropping the oldest lines past the cap. */
const appendItems = (
  state: StreamState,
  added: LogsTimelineItem[],
): StreamState => {
  const fresh = withoutKnown(added, state.items);
  const items = [...state.items, ...fresh];
  const overflow = items.length - LOGS_PAGE_MAX_ENTRIES;
  const dropped = overflow > 0 ? items.slice(0, overflow) : [];

  return {
    ...state,
    items: overflow > 0 ? items.slice(overflow) : items,
    appendedCount: state.appendedCount + countVisible(fresh, state.filter),
    firstItemIndex: state.firstItemIndex + countVisible(dropped, state.filter),
    ...(overflow > 0 && { hasOlder: false, isAtLimit: true }),
  };
};

function streamReducer(state: StreamState, action: StreamAction): StreamState {
  switch (action.type) {
    case "reset":
      return {
        ...initialState(action.filter),
        connection: state.connection,
        statuses: state.statuses,
        isPaused: state.isPaused,
      };
    case "connection":
      return { ...state, connection: action.connection };
    case "page": {
      const pageItems = action.entries.map(toItem);

      if (action.kind === "latest") {
        // Lines that arrived live while the page was on its way go after it.
        const items = [...pageItems, ...withoutKnown(state.items, pageItems)];
        return {
          ...state,
          items: items.slice(-LOGS_PAGE_MAX_ENTRIES),
          isLoaded: true,
          hasOlder: !action.done,
        };
      }

      if (action.kind === "older") {
        const room = LOGS_PAGE_MAX_ENTRIES - state.items.length;
        const fresh = withoutKnown(pageItems, state.items);
        const kept = room > 0 ? fresh.slice(-room) : [];
        const isAtLimit = kept.length < fresh.length;

        return {
          ...state,
          items: [...kept, ...state.items],
          hasOlder: !action.done && !isAtLimit,
          isLoadingOlder: false,
          isAtLimit: state.isAtLimit || isAtLimit,
          firstItemIndex:
            state.firstItemIndex - countVisible(kept, state.filter),
        };
      }

      return {
        ...appendItems(state, pageItems),
        isLoaded: true,
      };
    }
    case "older-requested":
      return { ...state, isLoadingOlder: true };
    case "append": {
      if (!state.isPaused) {
        return appendItems(state, action.items);
      }

      const fresh = withoutKnown(action.items, state.held);
      const held = [...state.held, ...fresh].slice(-LOGS_PAGE_MAX_ENTRIES);
      const heldErrorCount =
        state.heldErrorCount +
        fresh.filter(
          (item) =>
            item.kind === "entry" &&
            item.entry.level === "error" &&
            isLogsItemVisible(item, state.filter),
        ).length;

      return { ...state, held, heldErrorCount };
    }
    case "reconnect-settled": {
      const settle = (item: LogsTimelineItem): LogsTimelineItem =>
        item.kind === "reconnect" && item.id === action.id
          ? { ...item, state: action.state }
          : item;

      return {
        ...state,
        items: state.items.map(settle),
        held: state.held.map(settle),
      };
    }
    case "status":
      return {
        ...state,
        statuses: { ...state.statuses, [action.service]: action.status },
      };
    case "error":
      return { ...state, error: action.message };
    case "pause": {
      if (action.isPaused) {
        return { ...state, isPaused: true };
      }

      return {
        ...appendItems({ ...state, isPaused: false }, state.held),
        held: [],
        heldErrorCount: 0,
      };
    }
  }
}

function getLogsSocketUrl() {
  const url = new URL(LOGS_ROUTE_PATH, window.location.href);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return url;
}

let markerSequence = 0;

const createMarkerId = (kind: LogsMarker["kind"]) => {
  markerSequence += 1;
  return `marker-${kind}-${markerSequence}`;
};

type Controller = {
  socket?: WebSocket;
  /** The last cursor the server sent. */
  cursor?: string;
  /** Requests sent and not answered yet, in order. */
  pending: Array<{ kind: PageKind; generation: number }>;
  /** Bumped on every filter change: older answers are dropped. */
  generation: number;
  /** Failed connection attempts in a row. */
  attempts: number;
  retryTimer?: ReturnType<typeof setTimeout>;
  /** The next open asks for the latest lines instead of resuming. */
  needsLatest: boolean;
  /** The divider of the current reconnect, while catching up. */
  reconnectMarkerId?: string;
  /** A source rotated while catching up: lines may be missing. */
  hasGap: boolean;
  isResuming: boolean;
  isDisposed: boolean;
};

/**
 * Follows the booth's logs for `filter`. Returns the visible rows and what
 * the page needs to draw the toolbar, the badge and the list.
 */
export function useLogStream(filter: LogFilter) {
  const filterKey = JSON.stringify(filter);
  const [state, dispatch] = useReducer(streamReducer, filter, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const controllerRef = useRef<Controller>({
    pending: [],
    generation: 0,
    attempts: 0,
    needsLatest: true,
    hasGap: false,
    isResuming: false,
    isDisposed: false,
  });

  const sendHistory = useCallback(
    (kind: PageKind, cursor?: { before?: string; after?: string }) => {
      const controller = controllerRef.current;
      const socket = controller.socket;

      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
      }

      controller.pending.push({ kind, generation: controller.generation });
      socket.send(
        JSON.stringify({
          type: "history",
          filter: filterRef.current,
          limit: LOGS_PAGE_HISTORY_LIMIT,
          ...cursor,
        }),
      );
      return true;
    },
    [],
  );

  const connect = useCallback(() => {
    const controller = controllerRef.current;

    if (controller.isDisposed) {
      return;
    }

    clearTimeout(controller.retryTimer);
    controller.pending = [];

    const socket = new WebSocket(getLogsSocketUrl());
    controller.socket = socket;

    const settleResume = () => {
      controller.isResuming = false;
      if (controller.reconnectMarkerId) {
        dispatch({
          type: "reconnect-settled",
          id: controller.reconnectMarkerId,
          state: controller.hasGap ? "gap" : "complete",
        });
      }
      controller.reconnectMarkerId = undefined;
      controller.hasGap = false;
      dispatch({ type: "connection", connection: "live" });
    };

    socket.addEventListener("open", () => {
      if (controller.socket !== socket) return;

      controller.attempts = 0;
      dispatch({ type: "error", message: undefined });

      if (controller.needsLatest) {
        controller.needsLatest = false;
        sendHistory("latest");
        dispatch({ type: "connection", connection: "live" });
        return;
      }

      controller.isResuming = true;

      if (controller.cursor) {
        sendHistory("resume", { after: controller.cursor });
      } else {
        // The resume was refused: start again from the latest lines.
        controller.hasGap = true;
        sendHistory("fallback");
      }
    });

    socket.addEventListener("message", (event: MessageEvent) => {
      if (controller.socket !== socket || typeof event.data !== "string") {
        return;
      }

      let parsed;
      try {
        parsed = logsServerMessageSchema.safeParse(JSON.parse(event.data));
      } catch {
        return;
      }
      if (!parsed.success) return;

      const message = parsed.data;

      switch (message.type) {
        case "history": {
          const request = controller.pending.shift();
          controller.cursor = message.cursor;

          if (!request || request.generation !== controller.generation) {
            return;
          }

          dispatch({
            type: "page",
            kind: request.kind,
            entries: message.entries,
            done: message.done,
          });

          if (request.kind === "resume" && !message.done) {
            sendHistory("resume", { after: message.cursor });
          } else if (request.kind === "resume" || request.kind === "fallback") {
            settleResume();
          }
          return;
        }
        case "append":
          controller.cursor = message.cursor;
          dispatch({ type: "append", items: message.entries.map(toItem) });
          return;
        case "source-status":
          dispatch({
            type: "status",
            service: message.service,
            status: { state: message.state, message: message.message },
          });

          if (message.state === "rotated") {
            if (controller.isResuming) controller.hasGap = true;
            dispatch({
              type: "append",
              items: [
                {
                  kind: "rotated",
                  id: createMarkerId("rotated"),
                  timestamp: new Date().toISOString(),
                  service: message.service,
                },
              ],
            });
          }
          return;
        case "error":
          dispatch({ type: "error", message: message.message });
          return;
      }
    });

    socket.addEventListener("close", (event: CloseEvent) => {
      if (controller.socket !== socket || controller.isDisposed) return;

      controller.socket = undefined;
      controller.pending = [];

      if (event.code === LOGS_INVALID_CLOSE_CODE) {
        if (!controller.isResuming) {
          // The server refused a fresh request: retrying would loop.
          dispatch({ type: "connection", connection: "failed" });
          return;
        }

        controller.cursor = undefined;
      }

      if (event.code === LOGS_FELL_BEHIND_CLOSE_CODE) {
        // Catching up again could fall behind again: load the latest lines
        // instead, marked as a possible gap.
        controller.cursor = undefined;
      }

      const current = stateRef.current;

      if (current.isLoaded && !controller.reconnectMarkerId) {
        const id = createMarkerId("reconnect");
        controller.reconnectMarkerId = id;
        dispatch({
          type: "append",
          items: [
            {
              kind: "reconnect",
              id,
              timestamp: new Date().toISOString(),
              state: "pending",
            },
          ],
        });
      }

      if (!current.isLoaded) {
        controller.needsLatest = true;
      }

      const isOffline =
        controller.attempts >= LOGS_OFFLINE_AFTER_ATTEMPTS ||
        navigator.onLine === false;
      dispatch({
        type: "connection",
        connection: isOffline ? "offline" : "reconnecting",
      });

      const delay = Math.min(
        LOGS_RECONNECT_FIRST_DELAY_MS * 2 ** controller.attempts,
        LOGS_RECONNECT_MAX_DELAY_MS,
      );
      controller.attempts += 1;
      controller.retryTimer = setTimeout(connect, delay);
    });
  }, [sendHistory]);

  useEffect(() => {
    const controller = controllerRef.current;
    controller.isDisposed = false;
    connect();

    // Back online: try at once instead of waiting out the backoff.
    const reconnectNow = () => {
      if (!controller.socket) connect();
    };
    window.addEventListener("online", reconnectNow);

    return () => {
      controller.isDisposed = true;
      clearTimeout(controller.retryTimer);
      window.removeEventListener("online", reconnectNow);
      controller.socket?.close();
      controller.socket = undefined;
    };
  }, [connect]);

  // A new filter: history is filtered by the server, so start over.
  const appliedFilterKey = useRef(filterKey);
  useEffect(() => {
    if (appliedFilterKey.current === filterKey) return;
    appliedFilterKey.current = filterKey;

    const controller = controllerRef.current;
    controller.generation += 1;
    dispatch({ type: "reset", filter: filterRef.current });

    if (sendHistory("latest")) {
      controller.needsLatest = false;
    } else {
      controller.needsLatest = true;
    }
  }, [filterKey, sendHistory]);

  const loadOlder = useCallback(() => {
    const controller = controllerRef.current;
    const current = stateRef.current;

    if (
      !controller.cursor ||
      !current.isLoaded ||
      !current.hasOlder ||
      current.isLoadingOlder ||
      controller.isResuming
    ) {
      return;
    }

    if (sendHistory("older", { before: controller.cursor })) {
      dispatch({ type: "older-requested" });
    }
  }, [sendHistory]);

  /** Reconnects now, after a refusal or while waiting to retry. */
  const retry = useCallback(() => {
    const controller = controllerRef.current;
    controller.attempts = 0;
    if (stateRef.current.connection === "failed") {
      controller.needsLatest = true;
      controller.generation += 1;
      dispatch({ type: "reset", filter: filterRef.current });
    }
    dispatch({ type: "connection", connection: "reconnecting" });
    controller.socket?.close();
    connect();
  }, [connect]);

  const setPaused = useCallback((isPaused: boolean) => {
    dispatch({ type: "pause", isPaused });
  }, []);

  const visibleItems = useMemo(
    () => state.items.filter((item) => isLogsItemVisible(item, state.filter)),
    [state.items, state.filter],
  );

  return {
    ...state,
    visibleItems,
    loadOlder,
    retry,
    setPaused,
  };
}
