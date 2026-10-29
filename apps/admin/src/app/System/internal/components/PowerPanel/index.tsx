import type { FC } from "react";

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
import { Button } from "@dither-booth/ui/components/ui/button";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import clsx from "clsx";
import { Power } from "lucide-react";
import { useState } from "react";

import type { PowerAction } from "#lib/power/power.protocol";
import type { PowerPhase } from "#lib/power/power.utils";
import type { SystemStatus } from "#lib/system/system.utils";

import { usePowerControl } from "#lib/power/usePowerControl";

import { SystemPanel } from "../SystemPanel";

const ACTIONS: Array<{
  action: PowerAction;
  label: string;
  description: string;
  confirmTitle: string;
  confirmDescription: string;
  destructive?: boolean;
}> = [
  {
    action: "restart-apps",
    label: "Restart apps",
    description:
      "The engine, the admin and the Shutter start again. The Pi stays on.",
    confirmTitle: "Restart the apps?",
    confirmDescription:
      "Guests can't use the booth until the apps are back. This page reconnects on its own.",
  },
  {
    action: "reboot",
    label: "Reboot",
    description: "The whole Pi starts again.",
    confirmTitle: "Reboot the Pi?",
    confirmDescription:
      "Guests can't use the booth until the Pi has started again. This page reconnects on its own.",
  },
  {
    action: "power-off",
    label: "Power off",
    description:
      "The Pi shuts down. To start it again, unplug it and plug it back in.",
    confirmTitle: "Power off the booth?",
    confirmDescription:
      "It can't be turned back on from here: someone has to unplug it and plug it back in.",
    destructive: true,
  },
];

const IN_PROGRESS: Record<PowerAction, { label: string; message: string }> = {
  "restart-apps": {
    label: "Restarting",
    message:
      "Restarting the apps. This page reconnects on its own once they're back.",
  },
  reboot: {
    label: "Rebooting",
    message:
      "Rebooting the Pi. This page reconnects on its own once it's back.",
  },
  "power-off": {
    label: "Shutting down",
    message: "Shutting down. Wait for this page to say it's off.",
  },
};

const getHeaderStatus = (
  phase: PowerPhase,
  available: boolean | undefined,
): { status: SystemStatus | null; label: string } => {
  if (available === undefined) return { status: null, label: "Checking" };
  if (!available) return { status: null, label: "On the booth only" };

  switch (phase.kind) {
    case "sending":
    case "waiting":
      return { status: "warning", label: IN_PROGRESS[phase.action].label };
    case "off":
      return { status: null, label: "Off" };
    case "lost":
      return { status: "critical", label: "Not answering" };
    default:
      return { status: "ok", label: "Ready" };
  }
};

/** Where the action stands once it left the page; null when nothing runs. */
const PhaseMessage: FC<{ phase: PowerPhase; onDismiss: () => void }> = ({
  phase,
  onDismiss,
}) => {
  if (phase.kind === "sending" || phase.kind === "waiting") {
    return (
      <div
        role="status"
        className={clsx(
          "flex items-center gap-3 rounded-lg border px-3 py-3 text-sm",
        )}
      >
        <Spinner aria-hidden className={clsx("shrink-0")} />
        <span>{IN_PROGRESS[phase.action].message}</span>
      </div>
    );
  }

  if (phase.kind === "off") {
    return (
      <div
        role="status"
        className={clsx("rounded-lg border px-3 py-3 text-sm")}
      >
        <p className={clsx("font-medium")}>The booth has shut down.</p>
        <p className={clsx("text-muted-foreground")}>
          It stopped answering 10 seconds ago. Give it a few more seconds, then
          unplug it.
        </p>
      </div>
    );
  }

  if (phase.kind === "failed") {
    return (
      <p
        role="alert"
        className={clsx(
          "rounded-lg border border-destructive/40 px-3 py-3 text-sm text-destructive",
        )}
      >
        {phase.message}
      </p>
    );
  }

  if (phase.kind === "lost") {
    return (
      <div
        role="alert"
        className={clsx(
          "flex flex-wrap items-center gap-3 rounded-lg border px-3 py-3 text-sm",
        )}
      >
        <p className={clsx("flex-1")}>
          The booth hasn't answered for 5 minutes. Check that it's plugged in
          and on the same network as this device.
        </p>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    );
  }

  return null;
};

/**
 * Restart the apps, reboot or power off the Pi, each behind a confirm.
 * Once the admin server has accepted, the page watches it go down and
 * come back (or stay down), since nothing else can tell it.
 */
export const PowerPanel: FC = () => {
  const { available, phase, run, reset } = usePowerControl();
  const [confirming, setConfirming] = useState<PowerAction | null>(null);
  const header = getHeaderStatus(phase, available);
  const isBusy =
    phase.kind === "sending" ||
    phase.kind === "waiting" ||
    phase.kind === "off";
  const pending = ACTIONS.find((item) => item.action === confirming);

  return (
    <SystemPanel
      title="Power"
      icon={<Power />}
      tone="zinc"
      status={header.status}
      statusLabel={header.label}
      description={
        available === false
          ? "Only on the booth: here these would restart this computer."
          : undefined
      }
      className={clsx("lg:col-span-12")}
      contentClassName={clsx("flex flex-col gap-3")}
    >
      <PhaseMessage phase={phase} onDismiss={reset} />
      <ul className={clsx("divide-y")}>
        {ACTIONS.map((item) => (
          <li
            key={item.action}
            className={clsx(
              "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0",
            )}
          >
            <div className={clsx("min-w-0 flex-1")}>
              <p className={clsx("text-sm font-medium")}>{item.label}</p>
              <p className={clsx("text-sm text-muted-foreground")}>
                {item.description}
              </p>
            </div>
            <Button
              variant={item.destructive ? "destructive" : "outline"}
              disabled={available !== true || isBusy}
              onClick={() => setConfirming(item.action)}
            >
              {item.label}
            </Button>
          </li>
        ))}
      </ul>
      <AlertDialog
        open={pending !== undefined}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.confirmDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={pending?.destructive ? "destructive" : "default"}
              onClick={() => {
                if (pending) void run(pending.action);
                setConfirming(null);
              }}
            >
              {pending?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SystemPanel>
  );
};
