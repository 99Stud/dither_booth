import {
  BOOTH_UPDATE_HISTORY_LIMIT,
  type BoothUpdateJob,
  boothUpdateHistorySchema,
  boothUpdateJobSchema,
} from "@dither-booth/shared/booth-update";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

/*
 * The job's state on disk, the only thing the admin reads. Each write
 * replaces the file whole (write, then rename), so a reader never sees
 * half of it.
 */

const statusPath = (stateDir: string) => join(stateDir, "status.json");
const historyPath = (stateDir: string) => join(stateDir, "history.json");

async function writeJson(path: string, value: unknown): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 });
  await rename(tmp, path);
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

export async function readStatus(
  stateDir: string,
): Promise<BoothUpdateJob | undefined> {
  const parsed = boothUpdateJobSchema.safeParse(
    await readJson(statusPath(stateDir)),
  );
  return parsed.success ? parsed.data : undefined;
}

export async function readHistory(stateDir: string): Promise<BoothUpdateJob[]> {
  const parsed = boothUpdateHistorySchema.safeParse(
    await readJson(historyPath(stateDir)),
  );
  return parsed.success ? parsed.data : [];
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
      await update(patch);
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
