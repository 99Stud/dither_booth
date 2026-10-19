import { darkroomProcedure } from "#internal/trpc";
import { ENGINE_REPO_ROOT } from "#lib/constants";

import { getCurrentDeviceSetupLinks } from "../internal/device-setup.current-ticket";

/** Where a device goes to trust the booth and open the Shutter, from where it is now. */
export const getDeviceSetup = darkroomProcedure.query(({ ctx }) =>
  getCurrentDeviceSetupLinks(ctx.network, { repoRoot: ENGINE_REPO_ROOT }),
);
