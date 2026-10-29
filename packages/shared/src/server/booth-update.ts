import { readFile } from "node:fs/promises";

import {
  BOOTH_UPDATE_HISTORY_PATH,
  BOOTH_UPDATE_STATUS_PATH,
  type BoothUpdateJob,
  boothUpdateHistorySchema,
  boothUpdateJobSchema,
} from "#isomorphic/booth-update";

/*
 * What `booth update` and `booth rollback` wrote, as the admin and the
 * engine read it. Off the booth the files are missing: no job.
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
