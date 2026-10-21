import { logKioskEvent } from "@dither-booth/logging";

import { configProcedure } from "#internal/trpc";

import {
  readHubLink,
  unlinkFromHub as forgetHubLink,
} from "../internal/hub-link.service";
import { HUB_LOG_SOURCE } from "../internal/hub.constants";

/** Forgets the booth's link to the Hub. */
export const unlinkFromHub = configProcedure.mutation(({ ctx }) => {
  forgetHubLink(ctx.db);
  logKioskEvent("info", HUB_LOG_SOURCE, "hub-unlinked");
  return readHubLink(ctx.db);
});
