import { configProcedure } from "#internal/trpc";

import { readHubRegistration } from "../internal/hub-registration.service";

/** Whether the booth is registered with the Hub, and as which booth. */
export const getHubRegistration = configProcedure.query(({ ctx }) =>
  readHubRegistration(ctx.db),
);
