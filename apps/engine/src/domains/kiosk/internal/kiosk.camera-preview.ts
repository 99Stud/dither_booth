import type {
  CameraIceServer,
  CameraPreviewEndReason,
  CameraSignal,
} from "@dither-booth/shared/camera-preview";

import { logKioskEvent } from "@dither-booth/logging";
import { createId } from "@paralleldrive/cuid2";
import { EventEmitter, on } from "node:events";

import type { KioskChannel } from "./kiosk.channel";

import { KIOSK_LOG_SOURCE } from "./kiosk.constants";

/**
 * Live views of the booth camera. The engine only relays WebRTC signalling
 * between a viewer and the kiosk page that owns the camera; the video goes
 * straight between them. Each viewer's stream is its session: when it ends,
 * the page is told to stop.
 */
export type CameraPreview = {
  /**
   * Opens a session for a viewer and streams it its signals, starting with
   * `start`, until an `end` or until `signal` aborts. When there is no
   * camera to watch, or too many viewers, it yields a single `end`.
   */
  watch: (
    sessionId: string,
    signal?: AbortSignal,
  ) => AsyncGenerator<CameraSignal, void, undefined>;
  /** Relays a viewer's signal to the session's page. False if no such session. */
  fromViewer: (sessionId: string, signal: CameraSignal) => boolean;
  /**
   * Relays a page's signal to the session's viewer, only from the page the
   * session is on. False otherwise.
   */
  fromPage: (
    pageId: string,
    sessionId: string,
    signal: CameraSignal,
  ) => boolean;
  /** How many live views are open. */
  countViewers: () => number;
};

type Session = {
  pageId: string;
  events: EventEmitter;
  startedAt: number;
  timeoutId: ReturnType<typeof setTimeout>;
};

const SIGNAL_EVENT = "signal";

async function* single(
  signal: CameraSignal,
): AsyncGenerator<CameraSignal, void, undefined> {
  yield signal;
}

export function createCameraPreview({
  kioskChannel,
  iceServers,
  maxViewers,
  maxDurationMs,
  now = () => Date.now(),
}: {
  kioskChannel: KioskChannel;
  iceServers: CameraIceServer[];
  maxViewers: number;
  maxDurationMs: number;
  now?: () => number;
}): CameraPreview {
  const sessions = new Map<string, Session>();

  const sendToPage = (
    pageId: string,
    sessionId: string,
    signal: CameraSignal,
  ) => {
    kioskChannel.broadcast({
      type: "camera",
      pageId,
      sessionId,
      signal,
      commandId: createId(),
    });
  };

  /** Closes a session once, telling the sides that don't know yet. */
  const end = (
    sessionId: string,
    reason: CameraPreviewEndReason,
    tell: { page: boolean; viewer: boolean },
  ) => {
    const session = sessions.get(sessionId);
    if (!session) return;

    sessions.delete(sessionId);
    clearTimeout(session.timeoutId);
    const signal: CameraSignal = { kind: "end", reason };
    if (tell.page) sendToPage(session.pageId, sessionId, signal);
    if (tell.viewer) session.events.emit(SIGNAL_EVENT, signal);

    logKioskEvent("info", KIOSK_LOG_SOURCE, "camera-preview-ended", {
      details: {
        sessionId,
        pageId: session.pageId,
        reason,
        durationMs: now() - session.startedAt,
      },
    });
  };

  kioskChannel.onPageLeft((pageId) => {
    for (const [sessionId, session] of sessions) {
      if (session.pageId === pageId) {
        end(sessionId, "page-left", { page: false, viewer: true });
      }
    }
  });

  /** The page whose camera a new viewer watches: the newest one that works. */
  const findCameraPage = () =>
    kioskChannel
      .listPages()
      .filter(
        (page) => page.screen === "shutter" && page.camera?.status === "ready",
      )
      .toSorted((a, b) => b.connectedAt.getTime() - a.connectedAt.getTime())[0];

  async function* streamSignals(
    sessionId: string,
    signals: AsyncIterableIterator<unknown[]>,
    abortSignal: AbortSignal | undefined,
  ): AsyncGenerator<CameraSignal, void, undefined> {
    try {
      yield { kind: "start", iceServers };
      for await (const [signal] of signals) {
        yield signal as CameraSignal;
        if ((signal as CameraSignal).kind === "end") return;
      }
    } catch (error) {
      if (!abortSignal?.aborted) throw error;
    } finally {
      // The viewer stopped listening without an `end`: tell the page.
      end(sessionId, "viewer-left", { page: true, viewer: false });
    }
  }

  return {
    watch(sessionId, abortSignal) {
      if (abortSignal?.aborted)
        return single({ kind: "end", reason: "viewer-left" });

      const page = findCameraPage();
      if (!page) return single({ kind: "end", reason: "no-camera" });
      if (sessions.size >= maxViewers || sessions.has(sessionId)) {
        return single({ kind: "end", reason: "busy" });
      }

      const events = new EventEmitter();
      // Listening starts now, so nothing the page sends early is lost.
      const signals = on(
        events,
        SIGNAL_EVENT,
        abortSignal ? { signal: abortSignal } : {},
      );
      sessions.set(sessionId, {
        pageId: page.pageId,
        events,
        startedAt: now(),
        timeoutId: setTimeout(
          () => end(sessionId, "timeout", { page: true, viewer: true }),
          maxDurationMs,
        ),
      });
      abortSignal?.addEventListener(
        "abort",
        () => end(sessionId, "viewer-left", { page: true, viewer: false }),
        { once: true },
      );

      logKioskEvent("info", KIOSK_LOG_SOURCE, "camera-preview-started", {
        details: { sessionId, pageId: page.pageId },
      });
      sendToPage(page.pageId, sessionId, { kind: "start", iceServers });

      return streamSignals(sessionId, signals, abortSignal);
    },
    fromViewer(sessionId, signal) {
      const session = sessions.get(sessionId);
      if (!session) return false;

      if (signal.kind === "end") {
        end(sessionId, signal.reason, { page: true, viewer: true });
      } else {
        sendToPage(session.pageId, sessionId, signal);
      }
      return true;
    },
    fromPage(pageId, sessionId, signal) {
      const session = sessions.get(sessionId);
      if (!session || session.pageId !== pageId) return false;

      if (signal.kind === "end") {
        end(sessionId, signal.reason, { page: false, viewer: true });
      } else {
        session.events.emit(SIGNAL_EVENT, signal);
      }
      return true;
    },
    countViewers() {
      return sessions.size;
    },
  };
}
