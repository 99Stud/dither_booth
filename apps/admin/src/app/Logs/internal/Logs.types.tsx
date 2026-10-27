import type { LogEntry, LogService } from "#lib/logs/logs.types";

/** A line of the timeline drawn by the page, not read from a log. */
export type LogsMarker =
  | {
      kind: "rotated";
      id: string;
      timestamp: string;
      service: LogService;
    }
  | {
      kind: "reconnect";
      id: string;
      /** When the connection dropped. */
      timestamp: string;
      /** `pending` until caught up; `gap` when lines may be missing. */
      state: "pending" | "complete" | "gap";
    };

/** One row of the timeline. */
export type LogsTimelineItem =
  | { kind: "entry"; id: string; entry: LogEntry }
  | LogsMarker;

/**
 * - `connecting`: the first connection is opening.
 * - `live`: connected and caught up.
 * - `reconnecting`: the connection dropped; trying again, then catching up.
 * - `offline`: several attempts failed, or the browser is offline. Retrying.
 * - `failed`: the server refused the page's request. Retry by hand.
 */
export type LogsConnectionState =
  | "connecting"
  | "live"
  | "reconnecting"
  | "offline"
  | "failed";
