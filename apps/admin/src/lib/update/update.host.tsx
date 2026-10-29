import {
  isJobRunning,
  isReleaseBundle,
  readBoothRollbackTarget,
  readBoothUpdateJob,
} from "@dither-booth/shared/server/booth-update";
import { statfs } from "node:fs/promises";

import type { SystemctlRun } from "#lib/systemctl/systemctl.server";

import { runSystemctl } from "#lib/systemctl/systemctl.server";

import type { UpdateRouteDeps } from "./update.routes";

/*
 * The route's dependencies on the booth: the files `booth update` writes
 * (root's, readable by all), the journal, the disk, and systemctl. Off
 * the booth the files are missing, which reads as no job.
 */

/** The job's lines kept in the snapshot. */
const LOG_LINES = 40;

/** `booth`'s journal lines since `since`, oldest first; none without journalctl. */
async function readJobLog(since: string): Promise<string[]> {
  try {
    const proc = Bun.spawn(
      [
        "journalctl",
        "--identifier=booth",
        `--since=@${Math.floor(Date.parse(since) / 1000)}`,
        `--lines=${LOG_LINES}`,
        "--output=cat",
        "--no-pager",
      ],
      { stderr: "ignore", stdin: "ignore", stdout: "pipe" },
    );
    const [text] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    return text.split("\n").filter((line) => line.trim() !== "");
  } catch {
    return [];
  }
}

export const createHostUpdateDeps = ({
  repoRoot,
  releasesParent,
  run,
}: {
  repoRoot: string;
  /** Where the release folders live: what the CLI's 1 GB check measures. */
  releasesParent: string;
  run: SystemctlRun;
}): Pick<UpdateRouteDeps, "isRelease" | "readBooth" | "startUnit"> => ({
  isRelease: isReleaseBundle(repoRoot),
  async readBooth() {
    const [job, previous, free] = await Promise.all([
      readBoothUpdateJob(),
      readBoothRollbackTarget(),
      statfs(releasesParent).then(
        (stats) => stats.bavail * stats.bsize,
        () => null,
      ),
    ]);

    return {
      job,
      jobRunning: isJobRunning(job),
      log: job ? await readJobLog(job.startedAt) : [],
      previous,
      freeBytes: free,
    };
  },
  startUnit: (unit) => runSystemctl(["--no-block", "start", unit], run),
});
