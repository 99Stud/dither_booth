import type { KioskScreen } from "@dither-booth/shared/kiosk";

import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import { Badge } from "@dither-booth/ui/components/ui/badge";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Maximize, Video, VideoOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useTRPC } from "#lib/trpc/trpc.client";

import {
  formatLiveDuration,
  getLiveViewStatus,
} from "./internal/BoothCameraCard.utils";
import { useCameraLiveView } from "./internal/useCameraLiveView";

const HEALTHZ_POLL_MS = 15_000;

/** iOS Safari only fullscreens a video through its own call. */
const enterFullscreen = (video: HTMLVideoElement) => {
  const webkitVideo = video as HTMLVideoElement & {
    webkitEnterFullscreen?: () => void;
  };
  if (video.requestFullscreen) {
    void video.requestFullscreen().catch(() => undefined);
  } else {
    webkitVideo.webkitEnterFullscreen?.();
  }
};

/**
 * What the booth camera sees, live, to check framing and light or watch a
 * visit go wrong. It shows the picture as guests see it (mirrored), never
 * records, and stops on its own after 10 minutes or in a hidden tab.
 */
export const BoothCameraCard = () => {
  const trpc = useTRPC();
  const videoRef = useRef<HTMLVideoElement>(null);
  const { view, stream, liveSince, watch, stop } = useCameraLiveView();
  const [now, setNow] = useState(() => Date.now());
  const healthzQuery = useQuery(
    trpc.ops.getHealthz.queryOptions(undefined, {
      refetchInterval: HEALTHZ_POLL_MS,
      // Alone: it waits on the Shutter, which may be the thing that's down.
      trpc: { context: { skipBatch: true } },
    }),
  );

  const kiosk = healthzQuery.data?.shutter.kiosk;
  const pages = kiosk?.pages ?? [];
  const screen: KioskScreen | undefined = pages.length
    ? pages.some((page) => page.screen === "darkroom")
      ? "darkroom"
      : "shutter"
    : undefined;
  const cameraPage = pages
    .filter((page) => page.screen === "shutter")
    .toSorted((a, b) => b.connectedAt.localeCompare(a.connectedAt))[0];
  const { canWatch, message } = getLiveViewStatus(view, {
    screen,
    camera: cameraPage?.camera,
    cameraViewers: kiosk?.cameraViewers ?? 0,
    isUnreachable: healthzQuery.isError,
  });

  const isConnecting = view.status === "connecting";
  const isLive = view.status === "live";
  // A closed connection drops its last frame: an ended view goes back to
  // the placeholder rather than a grey square.
  const hasPicture = stream !== null && isLive;

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    if (!isLive) return;
    const intervalId = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, [isLive]);

  const watchLabel =
    view.status === "ended"
      ? view.reason === "failed"
        ? "Try again"
        : "Watch again"
      : "Watch live";

  return (
    <Card>
      <CardHeader>
        <CardTitle
          className={clsx("flex items-center justify-between gap-2.5")}
        >
          <span className={clsx("flex items-center gap-2.5")}>
            <IconBubble tone="sky">
              <Video />
            </IconBubble>
            <h2>Booth camera</h2>
          </span>
          {isLive && (
            <Badge variant="secondary" className={clsx("gap-1.5 tabular-nums")}>
              {/* The admin's "Live" dot, as on the event's lottery status. */}
              <span aria-hidden className={clsx("relative flex size-2")}>
                <span
                  className={clsx(
                    "absolute inline-flex size-full animate-ping rounded-full bg-success/60",
                  )}
                />
                <span
                  className={clsx(
                    "relative inline-flex size-2 rounded-full bg-success",
                  )}
                />
              </span>
              Live {formatLiveDuration(now - (liveSince ?? now))}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className={clsx("flex flex-col gap-3")}>
        <div
          className={clsx(
            "relative w-full overflow-hidden rounded-xl bg-muted",
            isConnecting || hasPicture ? "aspect-square" : "aspect-[2/1]",
            isConnecting && "animate-pulse",
          )}
        >
          <video
            ref={videoRef}
            aria-label="Live view of the booth camera"
            autoPlay
            muted
            playsInline
            className={clsx(
              "size-full -scale-x-100 object-cover",
              !hasPicture && "hidden",
            )}
          />
          {!hasPicture && (
            <div
              className={clsx(
                "absolute inset-0 flex items-center justify-center",
                "text-muted-foreground [&_svg:not([class*='size-'])]:size-8",
              )}
            >
              {isConnecting ? (
                <Spinner />
              ) : canWatch ? (
                <Video aria-hidden />
              ) : (
                <VideoOff aria-hidden />
              )}
            </div>
          )}
        </div>
        <div className={clsx("flex items-center gap-2")}>
          {isConnecting || isLive ? (
            <Button variant="outline" onClick={stop}>
              {isConnecting ? "Cancel" : "Stop"}
            </Button>
          ) : (
            <Button
              disabled={!canWatch}
              onClick={watch}
              aria-describedby={message ? "booth-camera-status" : undefined}
            >
              {watchLabel}
            </Button>
          )}
          {isLive && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Full screen"
              onClick={() =>
                videoRef.current && enterFullscreen(videoRef.current)
              }
            >
              <Maximize />
            </Button>
          )}
        </div>
        {message && (
          <p
            id="booth-camera-status"
            className={clsx("text-sm text-muted-foreground")}
            aria-live="polite"
          >
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
};
