import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@dither-booth/ui/components/ui/alert-dialog";
import { Badge } from "@dither-booth/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@dither-booth/ui/components/ui/collapsible";
import { Separator } from "@dither-booth/ui/components/ui/separator";
import { Switch } from "@dither-booth/ui/components/ui/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import clsx from "clsx";
import { format } from "date-fns";
import { ChevronsUpDown, Printer } from "lucide-react";
import { useState } from "react";

import { CONTROL_CENTER_LOG_SOURCE } from "#app/ControlCenter/internal/ControlCenter.constants";
import { notify } from "#lib/feedback/notify";
import { reportKioskError } from "#lib/logging/logging.utils";
import {
  getPrinterAction,
  getPrinterBadge,
  getPrinterHistoryLabel,
  getPrinterMaintenanceLine,
  getPrinterStatusLine,
  getPrinterTrouble,
  PRINTER_DRY_RUN_COPY,
  type PrinterTone,
} from "#lib/printer/printer.copy";
import { useTRPC } from "#lib/trpc/trpc.client";

const HEALTHZ_POLL_MS = 30_000;
/** While the printer can't print, maintenance follows within seconds. */
const HEALTHZ_FAULT_POLL_MS = 3_000;

const BADGE_CLASS: Record<PrinterTone, string> = {
  destructive: "bg-destructive/10 text-destructive",
  muted: "",
  success: "bg-success/10 text-success dark:bg-success/15",
  // Yellow text fails contrast on a light badge: the dot carries the colour.
  warning: "bg-warning/15 text-foreground",
};

const DOT_CLASS: Record<PrinterTone, string> = {
  destructive: "bg-destructive",
  muted: "animate-pulse bg-muted-foreground/50",
  success: "bg-success",
  warning: "bg-warning",
};

/**
 * The receipt printer, live: what it's doing, what to do about it, and the
 * switch that lets a printer problem put the booth in maintenance. The
 * engine pushes every change, so this never polls the printer.
 */
export const PrinterCard = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [isConfirmingOff, setIsConfirmingOff] = useState(false);
  const subscription = useSubscription(
    trpc.ops.watchPrinter.subscriptionOptions(),
  );
  // While the stream reconnects, its last status may be stale.
  const status =
    subscription.status === "pending" ? subscription.data : undefined;
  const healthzQuery = useQuery(
    trpc.ops.getHealthz.queryOptions(undefined, {
      refetchInterval:
        status?.canPrint === false ? HEALTHZ_FAULT_POLL_MS : HEALTHZ_POLL_MS,
      // Alone: it waits on the Shutter, which may be the thing that's down.
      trpc: { context: { skipBatch: true } },
    }),
  );
  const automaticMutation = useMutation(
    trpc.ops.setAutomaticMaintenance.mutationOptions(),
  );

  const maintenance = healthzQuery.data?.shutter.kiosk.maintenance;
  const isDryRun =
    healthzQuery.data?.printer.healthz.details?.watched === false;
  const isAutomaticOn = automaticMutation.isPending
    ? automaticMutation.variables.enabled
    : (maintenance?.automatic ?? true);
  const badge = isDryRun
    ? { label: PRINTER_DRY_RUN_COPY.label, tone: "muted" as const }
    : getPrinterBadge(status);
  const action = status ? getPrinterAction(status) : null;
  const maintenanceLine =
    status && maintenance && !isDryRun
      ? getPrinterMaintenanceLine({
          automatic: isAutomaticOn,
          reasons: maintenance.reasons,
          status,
        })
      : null;

  const setAutomatic = async (enabled: boolean) => {
    const result = await automaticMutation
      .mutateAsync({ enabled })
      .catch((error) => {
        reportKioskError(error, {
          event: "control-center-automatic-maintenance-failed",
          source: CONTROL_CENTER_LOG_SOURCE,
          userMessage: "Couldn't change automatic maintenance.",
        });
      });

    await queryClient.invalidateQueries(trpc.ops.getHealthz.queryFilter());
    if (result) {
      notify.success(
        enabled ? "Automatic maintenance on." : "Automatic maintenance off.",
      );
    }
  };

  const onAutomaticChange = (enabled: boolean) => {
    // Turning it off while nothing prints lets guests in for nothing.
    if (!enabled && status && !status.canPrint) {
      setIsConfirmingOff(true);
      return;
    }
    void setAutomatic(enabled);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle
          className={clsx("flex items-center justify-between gap-2.5")}
        >
          <span className={clsx("flex items-center gap-2.5")}>
            <IconBubble tone="amber">
              <Printer />
            </IconBubble>
            <h2>Printer</h2>
          </span>
          <Badge
            variant="secondary"
            className={clsx("gap-1.5", BADGE_CLASS[badge.tone])}
          >
            <span aria-hidden className={clsx("relative flex size-2")}>
              {badge.tone === "destructive" && (
                <span
                  className={clsx(
                    "absolute inline-flex size-full animate-ping rounded-full bg-destructive/60",
                  )}
                />
              )}
              <span
                className={clsx(
                  "relative inline-flex size-2 rounded-full",
                  DOT_CLASS[badge.tone],
                )}
              />
            </span>
            {badge.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className={clsx("flex flex-col gap-3")}>
        <div className={clsx("flex flex-col gap-1")} aria-live="polite">
          <p className={clsx("text-sm font-medium")}>
            {isDryRun
              ? PRINTER_DRY_RUN_COPY.line
              : status
                ? getPrinterStatusLine(status)
                : "Checking the printer…"}
          </p>
          {action && (
            <p className={clsx("text-sm text-muted-foreground")}>{action}</p>
          )}
          {maintenanceLine && (
            <p className={clsx("text-sm text-muted-foreground")}>
              {maintenanceLine}
            </p>
          )}
        </div>

        {status && status.history.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger
              className={clsx(
                "flex cursor-pointer items-center gap-1 text-sm font-medium",
              )}
            >
              Recent activity
              <ChevronsUpDown className={clsx("size-3")} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className={clsx("mt-1.5 space-y-0.5 text-sm")}>
                {status.history.map((entry) => (
                  <li
                    key={`${entry.at}-${entry.conditions.join(",")}`}
                    className={clsx("flex gap-3")}
                  >
                    <span
                      className={clsx("text-muted-foreground tabular-nums")}
                    >
                      {format(new Date(entry.at), "HH:mm:ss")}
                    </span>
                    {getPrinterHistoryLabel(entry.conditions)}
                  </li>
                ))}
              </ul>
              {status.raw && (
                <p className={clsx("mt-1.5 text-sm")}>
                  <span className={clsx("font-medium")}>last status:</span>
                  &nbsp;
                  <span className={clsx("font-mono")}>
                    {status.raw.match(/../g)?.join(" ")}
                  </span>
                </p>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}

        <Separator className={clsx("my-1")} />
        <div className={clsx("flex items-start justify-between gap-4")}>
          <div className={clsx("min-w-0")}>
            <label
              className={clsx("text-sm font-medium")}
              htmlFor="automatic-maintenance"
            >
              Automatic maintenance
            </label>
            <p className={clsx("text-sm text-muted-foreground")}>
              Puts the booth in maintenance when the printer is out of paper,
              open or unplugged, and back in service once it's fixed. Turns
              itself back on when the booth restarts.
            </p>
          </div>
          <Switch
            id="automatic-maintenance"
            checked={isAutomaticOn}
            disabled={!maintenance || automaticMutation.isPending}
            onCheckedChange={onAutomaticChange}
          />
        </div>
      </CardContent>

      <AlertDialog open={isConfirmingOff} onOpenChange={setIsConfirmingOff}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off automatic maintenance?</AlertDialogTitle>
            <AlertDialogDescription>
              {status ? `${capitalize(getPrinterTrouble(status))}. ` : ""}
              Guests will be able to start a visit, but their receipt won't
              print.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setIsConfirmingOff(false);
                void setAutomatic(false);
              }}
            >
              Turn off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);
