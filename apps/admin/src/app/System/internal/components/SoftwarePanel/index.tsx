import type { BoothUpdateJob } from "@dither-booth/shared/booth-update";
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
import { Badge } from "@dither-booth/ui/components/ui/badge";
import { Button } from "@dither-booth/ui/components/ui/button";
import clsx from "clsx";
import { formatDistanceToNowStrict } from "date-fns";
import { PackageCheck, RefreshCcw, Undo2 } from "lucide-react";
import { useState } from "react";

import { getSoftwareStatus, isRecentJob } from "#lib/update/update.utils";
import { useUpdateState } from "#lib/update/useUpdateState";

import { SystemPanel } from "../SystemPanel";
import { InstallDialog } from "./internal/InstallDialog";
import { ReleaseNotes } from "./internal/ReleaseNotes";
import { UpdateLog } from "./internal/UpdateLog";
import { UpdateProgress } from "./internal/UpdateProgress";
import { UpdateResult } from "./internal/UpdateResult";

const ago = (iso: string) =>
  formatDistanceToNowStrict(new Date(iso), { addSuffix: true });

/**
 * The release the booth runs, the latest one, and the buttons between
 * them. The job runs as root in its own unit, so the panel only starts
 * it, then follows what it writes: a gauge and its steps while it runs,
 * a mark that draws itself when it ends.
 */
export const SoftwarePanel: FC = () => {
  const { snapshot, isUnreachable, isSending, pending, run } = useUpdateState();
  const [installing, setInstalling] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const isBusy = Boolean(pending) || snapshot?.jobRunning === true;
  const header = getSoftwareStatus(snapshot, isBusy);
  const job = snapshot?.job ?? null;
  const previous = snapshot?.previous ?? null;

  return (
    <SystemPanel
      title="Software"
      icon={<PackageCheck />}
      tone="violet"
      status={header.status}
      statusLabel={header.label}
      description={
        snapshot === null
          ? "Only on the booth: it updates the booth it runs on."
          : undefined
      }
      className={clsx("lg:col-span-12")}
      contentClassName={clsx("flex flex-col gap-4")}
    >
      {snapshot && (
        <div
          className={clsx(
            "flex flex-wrap items-center justify-between gap-x-4 gap-y-2",
          )}
        >
          <div
            className={clsx(
              "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1",
            )}
          >
            <p className={clsx("text-sm font-medium")}>
              Runs <span className={clsx("font-mono")}>{snapshot.release}</span>
            </p>
            {!snapshot.isRelease && (
              <Badge variant="outline">Git checkout</Badge>
            )}
            <p className={clsx("text-sm text-muted-foreground")}>
              {snapshot.check.state === "unreachable"
                ? "Couldn't check for updates: is the booth on the internet?"
                : snapshot.check.checkedAt
                  ? `Checked ${ago(snapshot.check.checkedAt)}`
                  : "Not checked yet"}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={isSending}
            onClick={() => void run({ action: "check" })}
          >
            <RefreshCcw className={clsx(isSending && "animate-spin")} />
            Check now
          </Button>
        </div>
      )}

      {snapshot && isBusy && (
        <UpdateProgress
          job={snapshot.jobRunning ? job : null}
          isUnreachable={isUnreachable}
        />
      )}

      {snapshot && !isBusy && job && isRecentJob(job) && (
        <UpdateResult job={job} />
      )}

      {snapshot && job && (isBusy || isRecentJob(job)) && (
        <UpdateLog lines={snapshot.log} />
      )}

      {snapshot?.updateAvailable && snapshot.latest && !isBusy && (
        <div className={clsx("flex flex-col gap-3 rounded-lg border p-3")}>
          <div
            className={clsx(
              "flex flex-wrap items-center justify-between gap-x-4 gap-y-2",
            )}
          >
            <div>
              <p className={clsx("text-sm font-medium")}>
                {snapshot.latest.version} is available
              </p>
              {snapshot.latest.publishedAt && (
                <p className={clsx("text-sm text-muted-foreground")}>
                  Released {ago(snapshot.latest.publishedAt)}
                </p>
              )}
            </div>
            <Button
              onClick={() =>
                snapshot.latest && setInstalling(snapshot.latest.version)
              }
            >
              Update to {snapshot.latest.version}
            </Button>
          </div>
          <ReleaseNotes release={snapshot.latest} />
        </div>
      )}

      {previous && !isBusy && (
        <div
          className={clsx(
            "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-4",
          )}
        >
          <div className={clsx("min-w-0")}>
            <p className={clsx("text-sm font-medium")}>
              Before the last update:{" "}
              <span className={clsx("font-mono")}>{previous.release}</span>
            </p>
            <p className={clsx("text-sm text-muted-foreground")}>
              {previous.migrated
                ? "Going back restores the database from before that update."
                : "Going back keeps the database as it is."}
            </p>
          </div>
          <Button variant="outline" onClick={() => setRollingBack(true)}>
            <Undo2 />
            Roll back
          </Button>
        </div>
      )}

      {snapshot && (
        <InstallDialog
          snapshot={snapshot}
          version={installing}
          onCancel={() => setInstalling(null)}
          onConfirm={(version) => {
            setInstalling(null);
            void run({ action: "install", version });
          }}
        />
      )}

      <AlertDialog
        open={rollingBack && previous !== null}
        onOpenChange={setRollingBack}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Go back to {previous?.release}?</AlertDialogTitle>
            <AlertDialogDescription>
              {previous?.migrated
                ? `${snapshot?.release} changed the database, so going back restores the copy taken${previous.backupTakenAt ? ` ${ago(previous.backupTakenAt)}` : " before that update"}. Visits and draws since then are lost.`
                : "The booth restarts on the release it ran before. The database stays as it is."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={previous?.migrated ? "destructive" : "default"}
              onClick={() => {
                setRollingBack(false);
                void run({
                  action: "rollback",
                  mode: previous?.migrated ? "restore-db" : "keep-db",
                });
              }}
            >
              {previous?.migrated ? "Roll back and restore" : "Roll back"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SystemPanel>
  );
};
