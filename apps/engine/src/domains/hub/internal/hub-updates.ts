import type { BoothUpdateReport } from "@dither-booth/protocol/heartbeat";
import type { BoothUpdateJob } from "@dither-booth/shared/booth-update";
import type { SystemctlOutcome } from "@dither-booth/shared/server/systemctl";

import {
  getBoothUpdateUnit,
  isEventRunning,
  isReleaseVersion,
} from "@dither-booth/shared/booth-update";
import { isJobRunning } from "@dither-booth/shared/server/booth-update";
import { desc, eq } from "drizzle-orm";

import type { DbExecutor } from "#db/internal/db.types";

import { campaignTable, visitTable } from "#db/internal/db.schema";

/*
 * Updates Studio asks for. The Hub repeats the request in each heartbeat's
 * answer until the booth reports it running, so the booth keeps nothing:
 * it starts the update unit when it's quiet, and says how it goes in its
 * next heartbeats, from what `booth update` writes.
 */

/** A visit this recent means guests are using the booth. */
export const QUIET_AFTER_VISIT_MS = 15 * 60_000;
/** A job that ended this long ago is history: no longer reported. */
const JOB_REPORTED_FOR_MS = 24 * 60 * 60_000;

type Log = (
  level: "info" | "warn" | "error",
  event: string,
  details?: Record<string, unknown>,
) => void;

export type Quietness = { quiet: true } | { quiet: false; reason: string };

const timeOfDay = (date: Date) =>
  date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/**
 * Whether the booth may restart now: not while its event runs (the booth
 * owns its start and end, ADR 0005; a side left empty is open), nor
 * within 15 min of a visit, nor while a ticket prints.
 */
export function readQuietness(
  db: DbExecutor,
  now: Date,
  printing = false,
): Quietness {
  const event = db
    .select({ startsAt: campaignTable.startsAt, endsAt: campaignTable.endsAt })
    .from(campaignTable)
    .where(eq(campaignTable.status, "active"))
    .get();
  if (event && isEventRunning(event, now.getTime())) {
    return {
      quiet: false,
      reason: event.endsAt
        ? `The event runs until ${timeOfDay(event.endsAt)}.`
        : "The event has no end time: it waits for one, or for admin on the booth.",
    };
  }

  if (printing) {
    return { quiet: false, reason: "A ticket is printing." };
  }

  const lastVisit = db
    .select({ startedAt: visitTable.startedAt })
    .from(visitTable)
    .orderBy(desc(visitTable.startedAt))
    .limit(1)
    .get();

  if (
    lastVisit &&
    now.getTime() - lastVisit.startedAt.getTime() < QUIET_AFTER_VISIT_MS
  ) {
    return {
      quiet: false,
      reason: `Guests used the booth at ${timeOfDay(lastVisit.startedAt)}: it waits 15 minutes.`,
    };
  }

  return { quiet: true };
}

export type RemoteUpdates = {
  /**
   * The Hub's answer asked for `release`. The booth keeps nothing: the
   * Hub repeats the request in every answer until the job runs, so
   * quietness is checked on every heartbeat until it starts.
   */
  request: (release: string) => Promise<void>;
  /** What the next heartbeat says about it, if anything. */
  report: () => Promise<BoothUpdateReport | undefined>;
};

export function createRemoteUpdates({
  release: running,
  readJob,
  isJobRunning: jobRunning = isJobRunning,
  readQuietness: quietness,
  startUnit,
  log,
  now = () => new Date(),
}: {
  /** The release this engine runs. */
  release: string;
  readJob: () => Promise<BoothUpdateJob | null>;
  /** Whether a job's process still runs (`isJobRunning` on the booth). */
  isJobRunning?: (job: BoothUpdateJob | null) => boolean;
  readQuietness: () => Quietness;
  /** `systemctl --no-block start <unit>`. */
  startUnit: (unit: string) => Promise<SystemctlOutcome>;
  log: Log;
  now?: () => Date;
}): RemoteUpdates {
  // Only while a request waits or couldn't start: the job file says the rest.
  let waiting: BoothUpdateReport | null = null;

  return {
    async request(release) {
      if (release === running || !isReleaseVersion(release)) return;

      const job = await readJob();
      if (jobRunning(job)) return;

      const quiet = quietness();
      if (!quiet.quiet) {
        if (waiting?.error !== quiet.reason) {
          log("info", "hub-update-waiting", { release, reason: quiet.reason });
        }
        waiting = { release, state: "waiting", error: quiet.reason };
        return;
      }

      const outcome = await startUnit(getBoothUpdateUnit(release));

      if (outcome.ok) {
        log("info", "hub-update-started", { release });
        waiting = null;
      } else {
        log("warn", "hub-update-start-failed", {
          release,
          stderr: outcome.stderr,
        });
        waiting = { release, state: "failed", error: outcome.message };
      }
    },

    async report() {
      if (waiting) return waiting;

      const job = await readJob();
      if (
        !job ||
        job.kind !== "update" ||
        now().getTime() - Date.parse(job.updatedAt) > JOB_REPORTED_FOR_MS
      ) {
        return undefined;
      }

      return { release: job.to, state: job.state, error: job.error };
    },
  };
}
