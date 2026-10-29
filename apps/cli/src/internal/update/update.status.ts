import {
  BOOTH_UPDATE_HISTORY_LIMIT,
  type BoothRollbackTarget,
  type BoothUpdateJob,
  boothUpdateJobSchema,
} from "@dither-booth/shared/booth-update";
import {
  readBoothUpdateHistory,
  readBoothUpdateJob,
} from "@dither-booth/shared/server/booth-update";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

/*
 * The job's state on disk, the only thing the admin and the engine read.
 * Each write replaces the file whole (write, then rename), so a reader
 * never sees half of it. The files' names and schemas are
 * @dither-booth/shared/booth-update's.
 */

const statusPath = (stateDir: string) => join(stateDir, "status.json");
const historyPath = (stateDir: string) => join(stateDir, "history.json");
const rollbackPath = (stateDir: string) => join(stateDir, "rollback.json");

async function writeJson(path: string, value: unknown): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 });
  await rename(tmp, path);
}

export const readStatus = (stateDir: string) =>
  readBoothUpdateJob(statusPath(stateDir));

export const readHistory = (stateDir: string) =>
  readBoothUpdateHistory(historyPath(stateDir));

/** Where a rollback goes now: written after every job, read by the admin. */
export async function writeRollbackTarget(
  stateDir: string,
  target: BoothRollbackTarget,
): Promise<void> {
  await mkdir(stateDir, { recursive: true, mode: 0o755 });
  await writeJson(rollbackPath(stateDir), target);
}

export type JobRecorder = {
  readonly job: BoothUpdateJob;
  update: (patch: Partial<BoothUpdateJob>) => Promise<void>;
  /** The last write: the status, then the job at the head of the history. */
  finish: (patch: Partial<BoothUpdateJob>) => Promise<void>;
};

export async function createJobRecorder({
  stateDir,
  now,
  job: initial,
}: {
  stateDir: string;
  now: () => Date;
  job: BoothUpdateJob;
}): Promise<JobRecorder> {
  await mkdir(stateDir, { recursive: true, mode: 0o755 });

  let job = initial;

  const update = async (patch: Partial<BoothUpdateJob>) => {
    job = boothUpdateJobSchema.parse({
      ...job,
      ...patch,
      updatedAt: now().toISOString(),
    });
    await writeJson(statusPath(stateDir), job);
  };

  await update({});

  return {
    get job() {
      return job;
    },
    update,
    async finish(patch) {
      // A finished job has no process to watch.
      await update({ ...patch, process: null });
      const history = await readHistory(stateDir);
      await writeJson(
        historyPath(stateDir),
        [job, ...history.filter((entry) => entry.jobId !== job.jobId)].slice(
          0,
          BOOTH_UPDATE_HISTORY_LIMIT,
        ),
      );
    },
  };
}
