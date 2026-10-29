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
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { CircleAlert, CircleCheck, CircleX } from "lucide-react";

import type { UpdateSnapshot } from "#lib/update/update.protocol";

import { formatBytes } from "#lib/system/system.utils";
import { useTRPC } from "#lib/trpc/trpc.client";
import { getUpdateWarnings } from "#lib/update/update.utils";

type Check = { id: string; ok: boolean; text: string };

/** What must hold for the update to start: the CLI refuses otherwise. */
export function getPreflightChecks(snapshot: UpdateSnapshot): Check[] {
  const { freeBytes, neededBytes } = snapshot.preflight;
  return [
    {
      id: "internet",
      ok: snapshot.check.state === "ok",
      text:
        snapshot.check.state === "ok"
          ? "The booth reaches GitHub."
          : "The booth can't reach GitHub: is it on the internet?",
    },
    {
      id: "room",
      ok: freeBytes === null || freeBytes >= neededBytes,
      text:
        freeBytes === null
          ? "Room on the SD card: not read."
          : `${formatBytes(freeBytes)} free on the SD card; it needs ${formatBytes(neededBytes)}.`,
    },
    {
      id: "idle",
      ok: !snapshot.jobRunning,
      text: snapshot.jobRunning
        ? "Another update or rollback is running."
        : "Nothing else is running.",
    },
  ];
}

/**
 * Confirms an update: what it needs (each must hold, or Update stays
 * off), and what staff should know, which never stops it.
 */
export const InstallDialog: FC<{
  snapshot: UpdateSnapshot;
  version: string | null;
  onCancel: () => void;
  onConfirm: (version: string) => void;
}> = ({ snapshot, version, onCancel, onConfirm }) => {
  const trpc = useTRPC();
  const open = version !== null;
  // Only while asking: the engine may be down, and then they're unknown.
  const event = useQuery({
    ...trpc.config.getCurrentEvent.queryOptions(),
    enabled: open,
  });
  const stats = useQuery({
    ...trpc.config.getVisitStats.queryOptions(),
    enabled: open,
  });
  const healthz = useQuery({
    ...trpc.ops.getHealthz.queryOptions(undefined, {
      trpc: { context: { skipBatch: true } },
    }),
    enabled: open,
  });
  const checks = getPreflightChecks(snapshot);
  const blocked = checks.some((check) => !check.ok);
  const warnings = getUpdateWarnings({
    event: event.data?.campaign ?? null,
    recentVisits: stats.data?.recentVisits ?? null,
    printing: healthz.data?.printer.printing ?? null,
    now: Date.now(),
  });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Update to {version}?</AlertDialogTitle>
          <AlertDialogDescription>
            The booth keeps working while {version} downloads and installs, then
            restarts for a short while. If {version} doesn't start, the booth
            goes back to {snapshot.release} on its own.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul
          aria-label="Before updating"
          className={clsx("flex flex-col gap-1.5 text-sm")}
        >
          {checks.map((check) => (
            <li key={check.id} className={clsx("flex items-start gap-2")}>
              {check.ok ? (
                <CircleCheck
                  aria-hidden
                  className={clsx("mt-0.5 size-4 shrink-0 text-success")}
                />
              ) : (
                <CircleX
                  aria-hidden
                  className={clsx("mt-0.5 size-4 shrink-0 text-destructive")}
                />
              )}
              <span className={clsx(!check.ok && "text-destructive")}>
                {check.text}
              </span>
            </li>
          ))}
          {warnings.map((warning) => (
            <li key={warning.id} className={clsx("flex items-start gap-2")}>
              <CircleAlert
                aria-hidden
                className={clsx("mt-0.5 size-4 shrink-0 text-warning")}
              />
              <span>{warning.text}</span>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={blocked}
            onClick={() => {
              if (version) onConfirm(version);
            }}
          >
            {warnings.length > 0 ? "Update anyway" : "Update"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
