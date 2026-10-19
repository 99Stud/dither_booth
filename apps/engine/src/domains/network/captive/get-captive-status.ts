import { captiveProcedure } from "#internal/trpc";

import { getCaptiveStatus as readCaptiveStatus } from "../internal/network.service";

/** What the booth Wi-Fi's captive page shows. */
export const getCaptiveStatus = captiveProcedure.query(({ ctx }) =>
  readCaptiveStatus(ctx.network),
);
