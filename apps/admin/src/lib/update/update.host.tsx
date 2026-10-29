import {
  BOOTH_UPDATE_HISTORY_PATH,
  BOOTH_UPDATE_STATUS_PATH,
  boothUpdateHistorySchema,
  boothUpdateJobSchema,
} from "@dither-booth/shared/booth-update";
import { RELEASE_MANIFEST_FILE } from "@dither-booth/shared/server/release";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { SystemctlRun } from "#lib/systemctl/systemctl.server";

import { runSystemctl } from "#lib/systemctl/systemctl.server";

import type { UpdateRouteDeps } from "./update.routes";

/*
 * The route's dependencies on the booth: the files `booth update` writes
 * (root's, readable by all), and systemctl. Off the booth the files are
 * missing, which reads as no job.
 */

const readJson = async (path: string): Promise<unknown> => {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
};

export const createHostUpdateDeps = ({
  repoRoot,
  run,
}: {
  repoRoot: string;
  run: SystemctlRun;
}): Pick<
  UpdateRouteDeps,
  "isRelease" | "readJob" | "readHistory" | "startUnit"
> => ({
  // A release bundle carries release.json; a git checkout doesn't.
  isRelease: existsSync(join(repoRoot, RELEASE_MANIFEST_FILE)),
  readJob: async () => {
    const parsed = boothUpdateJobSchema.safeParse(
      await readJson(BOOTH_UPDATE_STATUS_PATH),
    );
    return parsed.success ? parsed.data : null;
  },
  readHistory: async () => {
    const parsed = boothUpdateHistorySchema.safeParse(
      await readJson(BOOTH_UPDATE_HISTORY_PATH),
    );
    return parsed.success ? parsed.data : [];
  },
  startUnit: (unit) => runSystemctl(["--no-block", "start", unit], run),
});
