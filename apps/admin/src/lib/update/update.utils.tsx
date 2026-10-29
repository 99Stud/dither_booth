import {
  BOOTH_UPDATE_STEPS,
  type BoothUpdateJob,
  type BoothUpdateStep,
} from "@dither-booth/shared/booth-update";

import type { SystemStatus } from "#lib/system/system.utils";

import type { UpdateSnapshot } from "./update.protocol";

import { UPDATE_RESULT_SHOWN_MS } from "./update.constants";

/** The steps staff see, in the words of the job they run. */
export const UPDATE_STEP_LABELS: Record<BoothUpdateStep, string> = {
  preflight: "Check",
  cli: "Update the booth tool",
  download: "Download",
  unpack: "Install",
  backup: "Back up the database",
  switch: "Switch",
  setup: "Set up the system",
  restart: "Restart",
  check: "Check it started",
  rollback: "Go back",
};

const ROLLBACK_STEPS: readonly BoothUpdateStep[] = [
  "switch",
  "restart",
  "check",
];

/**
 * The steps a job goes through, in order: a rollback only switches,
 * restarts and checks; `rollback` shows only once a job began going back.
 */
export function getJobSteps(job: BoothUpdateJob | null): BoothUpdateStep[] {
  const current = job?.step ?? "preflight";
  return BOOTH_UPDATE_STEPS.filter(
    (step) =>
      (step !== "rollback" || current === "rollback") &&
      (job?.kind !== "rollback" || ROLLBACK_STEPS.includes(step)),
  );
}

/** How far a job is, from 0 to 100: the steps behind it, out of all. */
export function getJobProgress(job: BoothUpdateJob | null): number {
  const steps = getJobSteps(job);
  const index = Math.max(0, steps.indexOf(job?.step ?? "preflight"));
  return Math.round((index / steps.length) * 100);
}

/** The booth is down from here until the check: the page loses the admin. */
export const isRestartStep = (step: BoothUpdateStep | undefined) =>
  step === "restart" || step === "check";

export type Warning = { id: string; text: string };

/**
 * What staff should know before starting an update, none of which stops
 * it: the event runs, guests used the booth, a ticket is printing.
 */
export function getUpdateWarnings({
  event,
  recentVisits,
  printing,
  now,
}: {
  event: { startsAt: string | null; endsAt: string | null } | null;
  recentVisits: number | null;
  printing: boolean | null;
  now: number;
}): Warning[] {
  const warnings: Warning[] = [];
  const started = event?.startsAt
    ? Date.parse(event.startsAt) <= now
    : event !== null;
  const notEnded = event?.endsAt
    ? now < Date.parse(event.endsAt)
    : event !== null;

  if (event && started && notEnded) {
    warnings.push({
      id: "event",
      text: "The event is running: guests may be waiting.",
    });
  }
  if (recentVisits) {
    warnings.push({
      id: "visits",
      text: `Guests used the booth ${recentVisits === 1 ? "once" : `${recentVisits} times`} in the last 15 minutes.`,
    });
  }
  if (printing) {
    warnings.push({
      id: "printing",
      text: "A ticket is printing: the restart would cut it off.",
    });
  }

  return warnings;
}

/** A job that ended this recently still shows its result. */
export const isRecentJob = (job: BoothUpdateJob, now = Date.now()) =>
  now - Date.parse(job.updatedAt) < UPDATE_RESULT_SHOWN_MS;

/**
 * The software's state in a word and a status, for the Software panel's
 * header, the sidebar's dot and the Health card's row.
 */
export function getSoftwareStatus(
  snapshot: UpdateSnapshot | null | undefined,
  isBusy = snapshot?.jobRunning === true,
): { status: SystemStatus | null; label: string } {
  if (snapshot === undefined) return { status: null, label: "Checking" };
  if (snapshot === null) return { status: null, label: "On the booth only" };
  if (isBusy) return { status: "warning", label: "Updating" };

  const { job } = snapshot;
  const ended = job && job.state !== "done" && isRecentJob(job);

  if (ended && job.state === "rolled-back") {
    return { status: "critical", label: "Rolled back" };
  }
  if (ended) return { status: "critical", label: "Update failed" };
  if (snapshot.updateAvailable) {
    return { status: "warning", label: "Update available" };
  }
  if (snapshot.check.state !== "ok") {
    return { status: null, label: "Not checked" };
  }

  return { status: "ok", label: "Up to date" };
}
