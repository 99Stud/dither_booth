import type { CameraSignal } from "@dither-booth/shared/camera-preview";

import { createCameraViewer } from "@dither-booth/shared/browser/camera-preview";
import { useMutation } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { useTRPC } from "#lib/trpc/trpc.client";

import type { LiveViewState } from "./BoothCameraCard.utils";

type Viewer = ReturnType<typeof createCameraViewer>;

/** A view left in a hidden tab stops, so the iPad isn't encoding for no one. */
const HIDDEN_STOP_MS = 30_000;

/**
 * A live view of the booth camera. The `ops.watchCamera` stream is the
 * session: watching opens it, and stopping, leaving the page or a hidden
 * tab ends it, which tells the booth screen to stop sending.
 */
export const useCameraLiveView = () => {
  const trpc = useTRPC();
  const [sessionId, setSessionId] = useState<string>();
  const [view, setView] = useState<LiveViewState>({ status: "idle" });
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [liveSince, setLiveSince] = useState<number>();
  const viewerRef = useRef<Viewer | null>(null);
  const { mutateAsync: sendCameraSignal } = useMutation(
    trpc.ops.sendCameraSignal.mutationOptions(),
  );

  const end = useCallback((next: LiveViewState) => {
    viewerRef.current = null;
    setView(next);
    setSessionId(undefined);
  }, []);

  const handleSignal = (signal: CameraSignal) => {
    if (!sessionId) return;

    if (signal.kind === "start") {
      viewerRef.current = createCameraViewer({
        iceServers: signal.iceServers,
        sendSignal: (next) => sendCameraSignal({ sessionId, signal: next }),
        onStream: setStream,
        onState: (state) => {
          if (state.status === "ended") return end(state);
          if (state.status === "live") setLiveSince(Date.now());
          setView(state);
        },
      });
      return;
    }

    // Ended before a viewer existed: no camera, or too many viewers.
    if (signal.kind === "end" && !viewerRef.current) {
      return end({ status: "ended", reason: signal.reason });
    }

    void viewerRef.current?.handleSignal(signal);
  };

  useSubscription(
    trpc.ops.watchCamera.subscriptionOptions(
      { sessionId: sessionId ?? "" },
      {
        // Not `skipToken`: with it the stream still opened, with no input.
        enabled: sessionId !== undefined,
        onData: handleSignal,
        onError: () => {
          viewerRef.current?.close();
          end({ status: "ended", reason: "failed" });
        },
      },
    ),
  );

  const watch = useCallback(() => {
    setStream(null);
    setLiveSince(undefined);
    setView({ status: "connecting" });
    setSessionId(crypto.randomUUID());
  }, []);

  const stop = useCallback(() => {
    if (viewerRef.current) {
      viewerRef.current.close(); // Reports `ended` through `onState`.
    } else {
      end({ status: "ended", reason: "viewer-left" });
    }
  }, [end]);

  const isActive = view.status === "connecting" || view.status === "live";

  useEffect(() => {
    if (!isActive) return;

    let timeoutId: number | undefined;
    const onVisibilityChange = () => {
      window.clearTimeout(timeoutId);
      if (document.visibilityState === "hidden") {
        timeoutId = window.setTimeout(stop, HIDDEN_STOP_MS);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isActive, stop]);

  useEffect(() => () => viewerRef.current?.close(), []);

  return { view, stream, liveSince, watch, stop };
};
