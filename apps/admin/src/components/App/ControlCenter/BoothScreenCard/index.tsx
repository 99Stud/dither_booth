import type { KioskScreen } from "@dither-booth/shared/kiosk";

import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import { Separator } from "@dither-booth/ui/components/ui/separator";
import { Switch } from "@dither-booth/ui/components/ui/switch";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@dither-booth/ui/components/ui/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { Camera, Monitor, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";

import { CONTROL_CENTER_LOG_SOURCE } from "#app/ControlCenter/internal/ControlCenter.constants";
import { notify } from "#lib/feedback/notify";
import { reportKioskError } from "#lib/logging/logging.utils";
import { useTRPC } from "#lib/trpc/trpc.client";

import {
  BOOTH_MODE_POLL_MS,
  BOOTH_MODE_SWITCH_TIMEOUT_MS,
  BOOTH_MODE_SWITCHING_POLL_MS,
} from "./internal/BoothScreenCard.constants";
import { getMaintenanceStatus } from "./internal/BoothScreenCard.utils";

/**
 * The booth screen's modes, as staff name them. The engine calls them kiosk
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
 * What the booth screen is doing, and the switches to change it: one tile per
 * mode, the lit one being the screen's mode right now. The Darkroom opens once
 * the current guest is done, on its PIN screen; going back to the photo booth
 * locks it. Below, maintenance tells guests to come back later, also once
 * the current guest is done; it is saved, so it holds while the screen is
 * offline or reloads, and the Darkroom still opens.
 */
export const BoothScreenCard = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [requested, setRequested] = useState<KioskScreen>();
  const healthzQuery = useQuery(
    trpc.ops.getHealthz.queryOptions(undefined, {
      refetchInterval: (query) => {
        const kiosk = query.state.data?.shutter.kiosk;
        const isMaintenancePending =
          kiosk?.maintenance.enabled === true &&
          kiosk.pages.length > 0 &&
          !kiosk.pages.some((page) => page.maintenance);

        return requested || isMaintenancePending
          ? BOOTH_MODE_SWITCHING_POLL_MS
          : BOOTH_MODE_POLL_MS;
      },
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
  const maintenanceMutation = useMutation(
    trpc.ops.setKioskMaintenance.mutationOptions(),
  );

  const kiosk = healthzQuery.data?.shutter.kiosk;
  const pages = kiosk?.pages;
  const current: KioskScreen | undefined = pages?.length
    ? pages.some((page) => page.screen === "darkroom")
      ? "darkroom"
      : "shutter"
    : undefined;
  const isPinMissing = pinStatus?.isSet === false;

  // The switch is done once the screen reports it, or given up on.
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
        userMessage: "Couldn't reach the booth screen.",
      });
    });

    if (!result) return;

    if (result.delivered === 0) {
      notify.warning("The booth screen is offline.");
      return;
    }

    setRequested(screen);
    notify.success(
      screen === "darkroom"
        ? "Opening the Darkroom on the booth screen."
        : "Back to the photo booth. Darkroom locked.",
    );
  };

  const setMaintenance = async (enabled: boolean) => {
    const result = await maintenanceMutation
      .mutateAsync({ enabled })
      .catch((error) => {
        reportKioskError(error, {
          event: "control-center-maintenance-failed",
          source: CONTROL_CENTER_LOG_SOURCE,
          userMessage: "Couldn't change maintenance.",
        });
      });

    await queryClient.invalidateQueries(trpc.ops.getHealthz.queryFilter());
    if (result)
      notify.success(enabled ? "Maintenance on." : "Back in service.");
  };

  // The switch shows the request while it is on its way, then what is saved.
  const isMaintenanceOn = maintenanceMutation.isPending
    ? maintenanceMutation.variables.enabled
    : (kiosk?.maintenance.enabled ?? false);
  const maintenanceStatus = getMaintenanceStatus({
    enabled: isMaintenanceOn,
    isShown: pages?.some((page) => page.maintenance) ?? false,
    screen: current,
  });

  const selected = requested ?? current;
  const isSwitching = requested !== undefined && requested !== current;

  const status = healthzQuery.isPending
    ? "Checking…"
    : healthzQuery.isError
      ? "Can't reach the booth."
      : current === undefined
        ? "The booth screen is offline."
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
            <Monitor />
          </IconBubble>
          <h2>Booth screen</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className={clsx("flex flex-col gap-3")}>
        <ToggleGroup
          aria-label="Booth screen mode"
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
                  // The path itself: the route config imports this page.
                  to="/settings"
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
        <Separator className={clsx("my-1")} />
        <div className={clsx("flex items-start justify-between gap-4")}>
          <div className={clsx("min-w-0")}>
            <label
              className={clsx("text-sm font-medium")}
              htmlFor="booth-maintenance"
            >
              Maintenance
            </label>
            <p className={clsx("text-sm text-muted-foreground")}>
              Guests see “be right back”. The Darkroom still opens.
            </p>
          </div>
          <Switch
            id="booth-maintenance"
            checked={isMaintenanceOn}
            disabled={!kiosk || maintenanceMutation.isPending}
            onCheckedChange={(checked) => void setMaintenance(checked)}
          />
        </div>
        {maintenanceStatus && (
          <p
            className={clsx("text-sm text-muted-foreground")}
            aria-live="polite"
          >
            {maintenanceStatus}
          </p>
        )}
      </CardContent>
    </Card>
  );
};
