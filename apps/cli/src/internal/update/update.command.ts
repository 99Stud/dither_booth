import { BOOTH_UPDATE_STATE_DIR } from "@dither-booth/shared/booth-update";

import type { JobOutcome } from "#internal/update/update";

import { buildBoothContext } from "#internal/context";
import { SilentExit } from "#internal/system";
import { fail, ok, warn } from "#internal/ui";
import { UpdateRefused } from "#internal/update/update";
import { createUpdateLayout } from "#internal/update/update.layout";

/*
 * What `booth update` and `booth rollback` share as commands: the booth's
 * layout, and how a job's end is printed and exits.
 */

export const boothUpdateLayout = () =>
  createUpdateLayout({
    repoRoot: buildBoothContext().repoRoot,
    stateDir: BOOTH_UPDATE_STATE_DIR,
  });

/** Prints how a job ended; a job that didn't finish `done` exits 1. */
export function reportOutcome(outcome: JobOutcome): void {
  if (outcome.kind === "up-to-date") {
    ok(`Already on v${outcome.version}.`);
    return;
  }

  if (outcome.kind === "handed-over") {
    if (outcome.exitCode !== 0) throw new SilentExit(outcome.exitCode);
    return;
  }

  const { job } = outcome;

  if (job.state === "done") {
    ok(`${job.kind === "update" ? "Updated" : "Rolled back"} to ${job.to}.`);
    return;
  }

  if (job.state === "rolled-back") {
    warn(`Rolled back to ${job.from}: ${job.error}`);
  } else {
    fail(`Nothing changed, the booth still runs ${job.from}: ${job.error}`);
  }

  throw new SilentExit(1);
}

/** Runs a job, and prints a refusal (lock held, nothing to go back to) as one. */
export async function runGuarded(task: () => Promise<JobOutcome>) {
  try {
    reportOutcome(await task());
  } catch (error) {
    if (error instanceof UpdateRefused) {
      fail(error.message);
      throw new SilentExit(1);
    }
    throw error;
  }
}
