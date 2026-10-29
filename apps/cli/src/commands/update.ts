import { BOOTH_UPDATE_STATE_DIR } from "@dither-booth/shared/booth-update";
import { defineCommand } from "citty";

import type { JobOutcome } from "#internal/update/update";

import { requireRoot } from "#internal/args";
import { buildBoothContext } from "#internal/context";
import { SilentExit } from "#internal/system";
import { fail, heading, ok, runBoothTask, warn } from "#internal/ui";
import { UpdateRefused, runUpdate } from "#internal/update/update";
import { hostUpdateHost } from "#internal/update/update.host";
import { createUpdateLayout } from "#internal/update/update.layout";

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

export default defineCommand({
  meta: {
    name: "update",
    description:
      "Install a release side by side, switch to it, roll back if it doesn't start",
  },
  args: {
    version: {
      type: "positional",
      required: false,
      description: "Release to install, e.g. 0.8.0 (default: the latest)",
    },
    resume: {
      type: "string",
      description: "Internal: carry on a job the previous CLI started",
    },
  },
  async setup() {
    requireRoot("update");
  },
  async run({ args }) {
    await runBoothTask(async () => {
      heading("Update the booth");
      await runGuarded(() =>
        runUpdate({
          layout: boothUpdateLayout(),
          host: hostUpdateHost,
          version: args.version?.replace(/^v/u, "") || undefined,
          resumeJobId: args.resume || undefined,
        }),
      );
    });
  },
});
