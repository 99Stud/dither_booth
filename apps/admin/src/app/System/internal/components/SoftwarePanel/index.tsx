import type { FC } from "react";

import {
  BOOTH_UPDATE_STEPS,
  type BoothUpdateJob,
  type BoothUpdateStep,
} from "@dither-booth/shared/booth-update";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@dither-booth/ui/components/ui/collapsible";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import clsx from "clsx";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Check,
  ChevronDown,
  Circle,
  PackageCheck,
  RefreshCcw,
} from "lucide-react";
import { useState } from "react";

import type { SystemStatus } from "#lib/system/system.utils";
import type {
  UpdateRequest,
  UpdateSnapshot,
} from "#lib/update/update.protocol";

import { UPDATE_RESULT_SHOWN_MS } from "#lib/update/update.constants";
import { useUpdateState } from "#lib/update/useUpdateState";

import { SystemPanel } from "../SystemPanel";

/** The steps staff see, in the words of the job they run. */
const STEP_LABELS: Record<BoothUpdateStep, string> = {
  preflight: "Check",
  cli: "Update the booth tool",
  download: "Download",
  unpack: "Install",
  setup: "Set up the system",
  backup: "Back up the database",
  switch: "Switch",
  restart: "Restart",
  check: "Check it started",
  rollback: "Go back",
};

const ago = (iso: string) =>
  formatDistanceToNowStrict(new Date(iso), { addSuffix: true });

const isRecent = (job: BoothUpdateJob) =>
  Date.now() - Date.parse(job.updatedAt) < UPDATE_RESULT_SHOWN_MS;

const getHeaderStatus = (
  snapshot: UpdateSnapshot | null | undefined,
  isBusy: boolean,
): { status: SystemStatus | null; label: string } => {
  if (snapshot === undefined) return { status: null, label: "Checking" };
  if (snapshot === null) return { status: null, label: "On the booth only" };
  if (isBusy) return { status: "warning", label: "Updating" };

  const { job } = snapshot;

  if (job && isRecent(job) && job.state === "rolled-back") {
    return { status: "critical", label: "Rolled back" };
  }
  if (job && isRecent(job) && job.state === "failed") {
    return { status: "critical", label: "Update failed" };
  }
  if (snapshot.updateAvailable) {
    return { status: "warning", label: "Update available" };
  }
  if (snapshot.check.state !== "ok")
    return { status: null, label: "Not checked" };

  return { status: "ok", label: "Up to date" };
};

/** Where a running job is, step by step; `rollback` only once it began. */
const JobSteps: FC<{ job: BoothUpdateJob | null; isUnreachable: boolean }> = ({
  job,
  isUnreachable,
}) => {
  const current = job?.step ?? "preflight";
  const steps = BOOTH_UPDATE_STEPS.filter(
    (step) =>
      (step !== "rollback" || current === "rollback") &&
      (job?.kind !== "rollback" ||
        ["switch", "restart", "check"].includes(step)),
  );
  const currentIndex = steps.indexOf(current);
  const isRestarting =
    isUnreachable || current === "restart" || current === "check";

  return (
    <div className={clsx("flex flex-col gap-3")}>
      <ol
        aria-label="Update steps"
        className={clsx("flex flex-col gap-1.5 text-sm")}
      >
        {steps.map((step, index) => (
          <li
            key={step}
            aria-current={index === currentIndex ? "step" : undefined}
            className={clsx(
              "flex items-center gap-2",
              index > currentIndex && "text-muted-foreground",
            )}
          >
            {index < currentIndex ? (
              <Check aria-hidden className={clsx("size-4 text-success")} />
            ) : index === currentIndex ? (
              <Spinner aria-hidden className={clsx("size-4")} />
            ) : (
              <Circle aria-hidden className={clsx("size-4")} />
            )}
            {STEP_LABELS[step]}
          </li>
        ))}
      </ol>
      <p role="status" className={clsx("rounded-lg border px-3 py-3 text-sm")}>
        {isRestarting
          ? "The booth is restarting. This page reconnects on its own."
          : "The booth keeps working while this runs. It restarts briefly at the end."}
      </p>
    </div>
  );
};

/** How the last job ended, while it's recent. */
const JobResult: FC<{ job: BoothUpdateJob }> = ({ job }) => {
  if (job.state === "done") {
    return (
      <p role="status" className={clsx("rounded-lg border px-3 py-3 text-sm")}>
        {job.kind === "update" ? "Updated" : "Rolled back"} to {job.to}{" "}
        {ago(job.updatedAt)}.
      </p>
    );
  }

  return (
    <div
      role="alert"
      className={clsx(
        "rounded-lg border border-destructive/40 px-3 py-3 text-sm",
      )}
    >
      <p className={clsx("font-medium text-destructive")}>
        {job.state === "rolled-back"
          ? `${job.to} didn't start. The booth went back to ${job.from}.`
          : `${job.kind === "update" ? "The update" : "The rollback"} stopped. The booth still runs ${job.from}.`}
      </p>
      {job.error && (
        <p className={clsx("text-muted-foreground")}>{job.error}</p>
      )}
    </div>
  );
};

type Confirm =
  | { kind: "install"; version: string }
  | { kind: "rollback"; restoreDb: boolean };

/**
 * The release the booth runs, the latest one, and the buttons that move
 * between them. The job itself runs as root in its own unit, so this
 * panel only starts it and follows what it writes.
 */
export const SoftwarePanel: FC = () => {
  const { snapshot, isUnreachable, isSending, pending, run } = useUpdateState();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const isBusy = Boolean(pending) || snapshot?.job?.state === "running";
  const header = getHeaderStatus(snapshot, isBusy);
  const job = snapshot?.job ?? null;

  const send = (request: UpdateRequest) => void run(request);

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
          <div className={clsx("min-w-0")}>
            <p className={clsx("text-sm font-medium")}>
              Runs <span className={clsx("font-mono")}>{snapshot.release}</span>
            </p>
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
            onClick={() => send({ action: "check" })}
          >
            <RefreshCcw className={clsx(isSending && "animate-spin")} />
            Check now
          </Button>
        </div>
      )}

      {snapshot && isBusy && (
        <JobSteps
          job={job?.state === "running" ? job : null}
          isUnreachable={isUnreachable}
        />
      )}

      {snapshot && !isBusy && job && isRecent(job) && <JobResult job={job} />}

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
                snapshot.latest &&
                setConfirm({
                  kind: "install",
                  version: snapshot.latest.version,
                })
              }
            >
              Update to {snapshot.latest.version}
            </Button>
          </div>
          {snapshot.latest.notes && (
            <Collapsible>
              <CollapsibleTrigger
                render={
                  <Button
                    size="sm"
                    variant="ghost"
                    className={clsx("group -ml-2")}
                  />
                }
              >
                What's new
                <ChevronDown
                  aria-hidden
                  className={clsx(
                    "transition-transform group-data-[panel-open]:rotate-180",
                  )}
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre
                  className={clsx(
                    "mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3 font-sans text-sm whitespace-pre-wrap",
                  )}
                >
                  {snapshot.latest.notes}
                </pre>
                {snapshot.latest.url && (
                  <a
                    href={snapshot.latest.url}
                    target="_blank"
                    rel="noreferrer"
                    className={clsx(
                      "mt-2 inline-block text-sm underline underline-offset-4",
                    )}
                  >
                    Full notes on GitHub
                  </a>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}

      {snapshot?.previous && !isBusy && (
        <div
          className={clsx(
            "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-4",
          )}
        >
          <div className={clsx("min-w-0")}>
            <p className={clsx("text-sm font-medium")}>
              Before the last update:{" "}
              <span className={clsx("font-mono")}>
                {snapshot.previous.release}
              </span>
            </p>
            <p className={clsx("text-sm text-muted-foreground")}>
              {snapshot.previous.migrated
                ? "Going back restores the database from before that update."
                : "Going back keeps the database as it is."}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              setConfirm({
                kind: "rollback",
                restoreDb: snapshot.previous?.migrated === true,
              })
            }
          >
            Roll back
          </Button>
        </div>
      )}

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "install"
                ? `Update to ${confirm.version}?`
                : `Go back to ${snapshot?.previous?.release}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "install"
                ? `The booth keeps working while ${confirm.version} downloads and installs, then restarts for a short while. If ${confirm.version} doesn't start, the booth goes back to ${snapshot?.release} on its own.`
                : confirm?.restoreDb
                  ? `${snapshot?.release} changed the database, so going back restores the copy taken${snapshot?.previous?.backupTakenAt ? ` ${ago(snapshot.previous.backupTakenAt)}` : " before that update"}. Visits and draws since then are lost.`
                  : "The booth restarts on the release it ran before. The database stays as it is."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={
                confirm?.kind === "rollback" && confirm.restoreDb
                  ? "destructive"
                  : "default"
              }
              onClick={() => {
                if (confirm?.kind === "install") {
                  send({ action: "install", version: confirm.version });
                } else if (confirm) {
                  send({
                    action: "rollback",
                    mode: confirm.restoreDb ? "restore-db" : "keep-db",
                  });
                }
                setConfirm(null);
              }}
            >
              {confirm?.kind === "install"
                ? "Update"
                : confirm?.restoreDb
                  ? "Roll back and restore"
                  : "Roll back"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SystemPanel>
  );
};
