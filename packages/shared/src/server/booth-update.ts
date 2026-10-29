import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  BOOTH_ROLLBACK_TARGET_PATH,
  BOOTH_UPDATE_HISTORY_PATH,
  BOOTH_UPDATE_STATUS_PATH,
  type BoothRollbackTarget,
  type BoothUpdateJob,
  boothRollbackTargetSchema,
  boothUpdateHistorySchema,
  boothUpdateJobSchema,
} from "#isomorphic/booth-update";
import { isProcessAlive } from "#server/process-identity";
import { RELEASE_MANIFEST_FILE } from "#server/release";

/*
 * What `booth update` and `booth rollback` leave on the booth, as the
 * CLI, the admin and the engine read it. Off the booth the files are
 * missing: no job, no history, nothing to go back to.
 */

const readJson = async (path: string): Promise<unknown> => {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
};

/** The job running now, or the last one. */
export async function readBoothUpdateJob(
  path = BOOTH_UPDATE_STATUS_PATH,
): Promise<BoothUpdateJob | null> {
  const parsed = boothUpdateJobSchema.safeParse(await readJson(path));
  return parsed.success ? parsed.data : null;
}

/** Finished jobs, newest first. */
export async function readBoothUpdateHistory(
  path = BOOTH_UPDATE_HISTORY_PATH,
): Promise<BoothUpdateJob[]> {
  const parsed = boothUpdateHistorySchema.safeParse(await readJson(path));
  return parsed.success ? parsed.data : [];
}

/** Where `booth rollback` would go now, or null. */
export async function readBoothRollbackTarget(
  path = BOOTH_ROLLBACK_TARGET_PATH,
): Promise<BoothRollbackTarget> {
  const parsed = boothRollbackTargetSchema.safeParse(await readJson(path));
  return parsed.success ? parsed.data : null;
}

/** Running, and its process still is: not a job a crash left behind. */
export const isJobRunning = (job: BoothUpdateJob | null) =>
  job?.state === "running" &&
  (job.process === null || isProcessAlive(job.process));

/**
 * Whether a folder holds a release bundle (it carries release.json), as
 * opposed to a git checkout from before releases.
 */
export const isReleaseBundle = (dir: string) =>
  existsSync(join(dir, RELEASE_MANIFEST_FILE));
