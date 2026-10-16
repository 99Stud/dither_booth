import type { KioskScreen } from "@dither-booth/shared/kiosk";

import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@dither-booth/ui/components/ui/toggle-group";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { Camera, SlidersHorizontal, Tablet } from "lucide-react";
import { useEffect, useState } from "react";

import { CONTROL_CENTER_LOG_SOURCE } from "#app/ControlCenter/internal/ControlCenter.constants";
import { APP_SETTINGS_LINK } from "#components/Layout/AppSidebar/internal/AppSidebar.constants";
import { notify } from "#lib/feedback/notify";
import { reportKioskError } from "#lib/logging/logging.utils";
import { useTRPC } from "#lib/trpc/trpc.client";

import {
  BOOTH_MODE_POLL_MS,
  BOOTH_MODE_SWITCH_TIMEOUT_MS,
  BOOTH_MODE_SWITCHING_POLL_MS,
} from "./internal/BoothIpadCard.constants";

/**
 * The booth iPad's modes, as staff name them. The engine calls them kiosk
 * screens (`shutter`, `darkroom`).
 */
const MODE_OPTIONS = [
  {
    value: "shutter",
    label: "Photo booth",
    caption: "For guests",
    Icon: Camera,
  },
  {
    value: "darkroom",
    label: "Darkroom",
    caption: "Print tuning",
    Icon: SlidersHorizontal,
  },
] as const;

const isKioskScreen = (value: unknown): value is KioskScreen =>
  MODE_OPTIONS.some((option) => option.value === value);

/**
 * What the booth iPad is doing, and the switch to change it: one tile per
 * mode, the lit one being the iPad's mode right now. The Darkroom opens once
 * the current guest is done, on its PIN screen; going back to the photo booth
 * locks it.
 */
export const BoothIpadCard = () => {
  const trpc = useTRPC();
  const [requested, setRequested] = useState<KioskScreen>();
  const healthzQuery = useQuery(
    trpc.ops.getHealthz.queryOptions(undefined, {
      refetchInterval: requested
        ? BOOTH_MODE_SWITCHING_POLL_MS
        : BOOTH_MODE_POLL_MS,
      // Alone: it waits on the Shutter, which may be the thing that's down.
      trpc: { context: { skipBatch: true } },
    }),
  );
  const { data: pinStatus } = useQuery(
    trpc.config.getDarkroomPinStatus.queryOptions(),
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
  const isPinMissing = pinStatus?.isSet === false;

  // The switch is done once the iPad reports it, or given up on.
  useEffect(() => {
    if (!requested) return;
    if (current === requested) {
      setRequested(undefined);
      return;
    }
    const timeoutId = window.setTimeout(
      () => setRequested(undefined),
      BOOTH_MODE_SWITCH_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [current, requested]);

  const switchTo = async (screen: KioskScreen) => {
    const result = await showKioskScreen({ screen }).catch((error) => {
      reportKioskError(error, {
        event: "control-center-booth-mode-failed",
        source: CONTROL_CENTER_LOG_SOURCE,
        userMessage: "Couldn't reach the booth iPad.",
      });
    });

    if (!result) return;

    if (result.delivered === 0) {
      notify.warning("The booth iPad is offline.");
      return;
    }

    setRequested(screen);
    notify.success(
      screen === "darkroom"
        ? "Opening the Darkroom on the booth iPad."
        : "Back to the photo booth. Darkroom locked.",
    );
  };

  const selected = requested ?? current;
  const isSwitching = requested !== undefined && requested !== current;

  const status = healthzQuery.isPending
    ? "Checking…"
    : healthzQuery.isError
      ? "Can't reach the booth."
      : current === undefined
        ? "The booth iPad is offline."
        : isSwitching
          ? requested === "darkroom"
            ? "Opening the Darkroom when the current guest is done…"
            : "Going back to the photo booth…"
          : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className={clsx("flex items-center gap-2.5")}>
          <IconBubble tone="emerald">
            <Tablet />
          </IconBubble>
          <h2>Booth iPad</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className={clsx("flex flex-col gap-3")}>
        <ToggleGroup
          aria-label="Booth iPad mode"
          className={clsx("grid w-full grid-cols-2")}
          spacing={2}
          variant="outline"
          disabled={current === undefined || isPending}
          value={selected ? [selected] : []}
          onValueChange={(next: unknown[]) => {
            const [screen] = next;
            if (isKioskScreen(screen) && screen !== selected) {
              void switchTo(screen);
            }
          }}
        >
          {MODE_OPTIONS.map(({ value, label, caption, Icon }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              disabled={value === "darkroom" && isPinMissing}
              className={clsx(
                "h-auto flex-col gap-0.5 rounded-xl py-3 text-sm",
                "data-[pressed]:border-primary data-[pressed]:bg-primary/5",
                "data-[pressed]:text-primary [&_svg:not([class*='size-'])]:size-5",
              )}
            >
              <Icon className={clsx("mb-1")} />
              <span className={clsx("font-medium")}>{label}</span>
              <span className={clsx("text-xs text-muted-foreground")}>
                {caption}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {(status || isPinMissing) && (
          <p
            className={clsx("text-sm text-muted-foreground")}
            aria-live="polite"
          >
            {status ?? (
              <>
                To open the Darkroom,{" "}
                <Link
                  to={APP_SETTINGS_LINK.path}
                  className={clsx(
                    "text-primary underline-offset-4 hover:underline",
                  )}
                >
                  set its PIN
                </Link>
                .
              </>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
};
