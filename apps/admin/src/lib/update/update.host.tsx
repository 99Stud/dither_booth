import {
  readBoothUpdateHistory,
  readBoothUpdateJob,
} from "@dither-booth/shared/server/booth-update";
import { RELEASE_MANIFEST_FILE } from "@dither-booth/shared/server/release";
import {
  type SystemctlRun,
  runSystemctl,
} from "@dither-booth/shared/server/systemctl";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { UpdateRouteDeps } from "./update.routes";

/*
 * The route's dependencies on the booth: the files `booth update` writes
 * (root's, readable by all), and systemctl.
 */
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
  readJob: () => readBoothUpdateJob(),
  readHistory: () => readBoothUpdateHistory(),
  startUnit: (unit) => runSystemctl(["--no-block", "start", unit], run),
});
