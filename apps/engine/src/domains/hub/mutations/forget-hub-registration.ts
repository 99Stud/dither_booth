import { logKioskEvent } from "@dither-booth/logging";

import { configProcedure } from "#internal/trpc";

import { forgetRegistration } from "../internal/hub-registration.service";
import { HUB_LOG_SOURCE } from "../internal/hub.constants";

/**
 * Forgets the booth's registration here: it stops reporting to the Hub. The
 * Hub still lists the booth as registered until it registers again.
 */
export const forgetHubRegistration = configProcedure.mutation(({ ctx }) => {
  forgetRegistration(ctx.db);
  logKioskEvent("info", HUB_LOG_SOURCE, "hub-registration-forgotten");
});
