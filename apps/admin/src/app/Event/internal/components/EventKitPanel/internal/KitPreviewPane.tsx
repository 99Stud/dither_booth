import type { KitId, KitSettings } from "@dither-booth/shared/kits";
import type { FC } from "react";

import {
  getKitPreviewUrl,
  KIT_PREVIEW_READY_MESSAGE,
  KIT_PREVIEW_SURFACE_LABELS,
  KIT_PREVIEW_SURFACES,
  type KitPreviewMessage,
  type KitPreviewSurface,
} from "@dither-booth/shared/kit-preview";
import { PRINT_WIDTH_PX } from "@dither-booth/shared/printing";
import { Button } from "@dither-booth/ui/components/ui/button";
import { Skeleton } from "@dither-booth/ui/components/ui/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@dither-booth/ui/components/ui/toggle-group";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Eye, MonitorOff, RefreshCw, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useTRPC } from "#lib/trpc/trpc.client";

/** The booth iPad's CSS viewport (iPad Pro 11" in landscape). */
const SCREEN_SIZE = { width: 1194, height: 834 };
/** Tickets render at paper width with a margin, as tall as they get. */
const TICKET_SIZE = { width: PRINT_WIDTH_PX + 64, height: 1500 };

const isTicket = (surface: KitPreviewSurface) =>
  surface === "photo" || surface === "lotteryWin" || surface === "lotteryLoss";

interface KitPreviewPaneProps {
  kitId: KitId;
  settings: KitSettings;
}

/**
 * The booth's own screens and tickets, framed and fed the unsaved draft:
 * what shows here is what the booth will show after Save. The frame renders
 * at the iPad's real size and is scaled down to fit.
 */
export const KitPreviewPane: FC<KitPreviewPaneProps> = (props) => {
  const { kitId, settings } = props;
  const trpc = useTRPC();
  // The engine's health check knows Shutter's public origin.
  const healthz = useQuery(trpc.ops.getHealthz.queryOptions());
  const shutterOrigin = healthz.data?.shutter.origin;
  const [surface, setSurface] = useState<KitPreviewSurface>("landing");
  const [isReady, setIsReady] = useState(false);
  // Held "Compare": the kit's own look, so before and after is one gesture.
  const [isComparing, setIsComparing] = useState(false);
  // Bumped by "Replay intro" to load the booth screen from scratch.
  const [replay, setReplay] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);

  const size = isTicket(surface) ? TICKET_SIZE : SCREEN_SIZE;
  const scale = boxWidth > 0 ? Math.min(1, boxWidth / size.width) : 0;
  const draft: KitPreviewMessage = {
    type: "kit.preview",
    kitId,
    settings: isComparing ? {} : settings,
  };
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => {
      setBoxWidth(entry?.contentRect.width ?? 0);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // The frame says when it listens; it then gets the draft at once.
  useEffect(() => {
    if (!shutterOrigin) return;
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== shutterOrigin ||
        event.source !== frameRef.current?.contentWindow ||
        event.data?.type !== KIT_PREVIEW_READY_MESSAGE.type
      ) {
        return;
      }
      setIsReady(true);
      frameRef.current?.contentWindow?.postMessage(
        draftRef.current,
        shutterOrigin,
      );
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [shutterOrigin]);

  // Every edit, at most once a frame, so sliders stay smooth.
  const draftKey = JSON.stringify(draft);
  useEffect(() => {
    if (!shutterOrigin || !isReady) return;
    const frame = requestAnimationFrame(() => {
      frameRef.current?.contentWindow?.postMessage(
        draftRef.current,
        shutterOrigin,
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [draftKey, shutterOrigin, isReady]);

  const src = shutterOrigin
    ? getKitPreviewUrl(shutterOrigin, window.location.origin, surface)
    : null;

  return (
    <section
      aria-label="Live preview"
      className={clsx(
        "flex flex-col gap-3 rounded-xl border border-border bg-card p-3",
      )}
    >
      <div
        className={clsx("flex flex-wrap items-center justify-between gap-2")}
      >
        <ToggleGroup
          aria-label="What to preview"
          className={clsx("flex-wrap")}
          spacing={1}
          size="sm"
          variant="outline"
          value={[surface]}
          onValueChange={(next: unknown[]) => {
            const [value] = next;
            if (!value || value === surface) return;
            setIsReady(false);
            setSurface(value as KitPreviewSurface);
          }}
        >
          {KIT_PREVIEW_SURFACES.map((option) => (
            <ToggleGroupItem
              key={option}
              value={option}
              className={clsx(
                "px-2.5",
                "data-[pressed]:border-foreground/40 data-[pressed]:bg-muted",
              )}
            >
              {KIT_PREVIEW_SURFACE_LABELS[option]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className={clsx("flex items-center gap-2")}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label="Hold to compare with the kit's own look"
            onPointerDown={() => setIsComparing(true)}
            onPointerUp={() => setIsComparing(false)}
            onPointerLeave={() => setIsComparing(false)}
            onPointerCancel={() => setIsComparing(false)}
            onBlur={() => setIsComparing(false)}
            onKeyDown={(event) => {
              if (event.key === " " || event.key === "Enter") {
                setIsComparing(true);
              }
            }}
            onKeyUp={() => setIsComparing(false)}
          >
            <Eye data-icon="inline-start" />
            Compare
          </Button>
          {surface === "landing" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setIsReady(false);
                setReplay((count) => count + 1);
              }}
            >
              <RotateCcw data-icon="inline-start" />
              Replay intro
            </Button>
          ) : null}
        </div>
      </div>
      <p className={clsx("text-xs text-muted-foreground")}>
        {isComparing
          ? "Showing the kit's own look."
          : "Unsaved changes show here first."}
      </p>

      <div
        ref={boxRef}
        className={clsx(
          "relative w-full overflow-hidden rounded-lg bg-muted",
          isTicket(surface) && "max-h-[70vh] overflow-y-auto",
        )}
        style={{ height: isTicket(surface) ? undefined : size.height * scale }}
      >
        {healthz.isError ? (
          <div
            role="status"
            className={clsx(
              "flex flex-col items-center justify-center gap-3 p-8 text-center",
            )}
            style={{ minHeight: SCREEN_SIZE.height * scale }}
          >
            <MonitorOff aria-hidden className={clsx("size-6")} />
            <p className={clsx("text-sm")}>
              The preview needs the booth screen, which isn&apos;t answering.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void healthz.refetch()}
            >
              <RefreshCw data-icon="inline-start" />
              Retry
            </Button>
          </div>
        ) : null}

        {src && scale > 0 ? (
          <div
            style={{
              width: size.width * scale,
              height: size.height * scale,
            }}
            className={clsx("relative mx-auto")}
          >
            <iframe
              key={`${src}#${replay}`}
              ref={frameRef}
              src={src}
              title={`Preview: ${KIT_PREVIEW_SURFACE_LABELS[surface]}`}
              width={size.width}
              height={size.height}
              className={clsx("origin-top-left border-0")}
              style={{ transform: `scale(${scale})` }}
            />
          </div>
        ) : null}

        {!healthz.isError && (!src || !isReady) ? (
          <Skeleton
            aria-label="Loading the preview"
            className={clsx("absolute inset-0 rounded-lg")}
          />
        ) : null}
      </div>
    </section>
  );
};
