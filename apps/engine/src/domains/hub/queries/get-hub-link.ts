import { configProcedure } from "#internal/trpc";

import { readHubLink } from "../internal/hub-link.service";

/** Whether the booth is registered with the Hub, and as which booth. */
export const getHubLink = configProcedure.query(({ ctx }) =>
  readHubLink(ctx.db),
);
