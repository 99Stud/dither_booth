import type { KioskScreen } from "@dither-booth/shared/kiosk";
import type { FC } from "react";

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@dither-booth/ui/components/ui/toggle-group";
import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Camera, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";

import { SETTINGS_LOG_SOURCE } from "#app/Settings/internal/Settings.constants";
import { notify } from "#lib/feedback/notify";
import { reportKioskError } from "#lib/logging/logging.utils";
import { useTRPC } from "#lib/trpc/trpc.client";

import {
  KIOSK_SCREEN_POLL_MS,
  KIOSK_SCREEN_SWITCH_TIMEOUT_MS,
  KIOSK_SCREEN_SWITCHING_POLL_MS,
} from "../../DarkroomCard.constants";

const SCREEN_OPTIONS = [
  { value: "shutter", label: "Shutter", Icon: Camera },
  { value: "darkroom", label: "Darkroom", Icon: SlidersHorizontal },
] as const;

const isKioskScreen = (value: unknown): value is KioskScreen =>
  SCREEN_OPTIONS.some((option) => option.value === value);

/**
 * What the booth iPad shows, as two tiles like Appearance's: the lit tile is
 * the kiosk's screen right now, and tapping the other one sends it there.
 * Opening the Darkroom waits for the current visit to end and shows its PIN
 * screen; going back to the Shutter locks the Darkroom.
 */
export const KioskScreenToggle: FC<{ isPinSet: boolean }> = ({ isPinSet }) => {
  const trpc = useTRPC();
  const [requested, setRequested] = useState<KioskScreen>();
  const healthzQuery = useQuery(
    trpc.ops.getHealthz.queryOptions(undefined, {
      refetchInterval: requested
        ? KIOSK_SCREEN_SWITCHING_POLL_MS
        : KIOSK_SCREEN_POLL_MS,
      // Alone: it waits on the Shutter, which may be the thing that's down.
      trpc: { context: { skipBatch: true } },
    }),
  );
  const { mutateAsync: showKioskScreen, isPending } = useMutation(
    trpc.ops.showKioskScreen.mutationOptions(),
  );

  const pages = healthzQuery.data?.shutter.kiosk.pages;
  const current: KioskScreen | undefined = pages?.length
    ? pages.some((page) => page.screen === "darkroom")
      ? "darkroom"
      : "shutter"
    : undefined;

  // The switch is done once the kiosk reports it, or given up on.
  useEffect(() => {
    if (!requested) return;
    if (current === requested) {
      setRequested(undefined);
      return;
    }
    const timeoutId = window.setTimeout(
      () => setRequested(undefined),
      KIOSK_SCREEN_SWITCH_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [current, requested]);

  const show = async (screen: KioskScreen) => {
    const result = await showKioskScreen({ screen }).catch((error) => {
      reportKioskError(error, {
        event: "settings-kiosk-screen-failed",
        source: SETTINGS_LOG_SOURCE,
        userMessage: "Failed to reach the kiosk.",
      });
    });

    if (!result) return;

    if (result.delivered === 0) {
      notify.warning("No kiosk page is connected.");
      return;
    }

    setRequested(screen);
    notify.success(
      screen === "darkroom"
        ? "The kiosk opens the Darkroom once the current visit ends. Enter the PIN there."
        : "The kiosk is back on the Shutter. The Darkroom is locked.",
    );
  };

  const selected = requested ?? current;
  const isOffline = healthzQuery.isSuccess && current === undefined;

  return (
    <div className={clsx("flex flex-col gap-2")}>
      <ToggleGroup
        aria-label="Kiosk screen"
        className={clsx("grid w-full grid-cols-2")}
        spacing={2}
        variant="outline"
        disabled={current === undefined || isPending}
        value={selected ? [selected] : []}
        onValueChange={(next: unknown[]) => {
          const [screen] = next;
          if (isKioskScreen(screen) && screen !== selected) void show(screen);
        }}
      >
        {SCREEN_OPTIONS.map(({ value, label, Icon }) => (
          <ToggleGroupItem
            key={value}
            value={value}
            disabled={value === "darkroom" && !isPinSet}
            className={clsx(
              "h-auto flex-col gap-1.5 rounded-xl py-3 text-sm",
              "data-[pressed]:border-primary data-[pressed]:bg-primary/5",
              "data-[pressed]:text-primary [&_svg:not([class*='size-'])]:size-5",
            )}
          >
            <Icon />
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className={clsx("text-sm text-muted-foreground")} aria-live="polite">
        {healthzQuery.isPending
          ? "Checking the kiosk…"
          : healthzQuery.isError
            ? "Can't reach the booth."
            : isOffline
              ? "No kiosk connected."
              : requested && requested !== current
                ? requested === "darkroom"
                  ? "Opening the Darkroom once the current visit ends…"
                  : "Going back to the Shutter…"
                : !isPinSet
                  ? "Set a PIN below to open the Darkroom."
                  : "What the booth iPad shows right now."}
      </p>
    </div>
  );
};
