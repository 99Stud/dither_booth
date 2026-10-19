import { darkroomProcedure } from "#internal/trpc";
import { ENGINE_REPO_ROOT } from "#lib/constants";

import { getDeviceSetupLinks } from "../internal/device-setup.links";

/** Where a device goes to trust the booth and open the Shutter. */
export const getDeviceSetup = darkroomProcedure.query(() =>
  getDeviceSetupLinks({ repoRoot: ENGINE_REPO_ROOT }),
);
