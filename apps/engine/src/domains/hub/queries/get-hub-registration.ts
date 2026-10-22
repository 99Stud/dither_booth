import { configProcedure } from "#internal/trpc";

import { readHubRegistration } from "../internal/hub-registration.service";

/**
 * Whether the booth is registered with the Hub, as which booth, and how its
 * last report went.
 */
export const getHubRegistration = configProcedure.query(({ ctx }) => ({
  ...readHubRegistration(ctx.db),
  report: ctx.hubReporter.getState(),
}));
