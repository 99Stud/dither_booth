import { darkroomProcedure } from "#internal/trpc";

import { getNetworkStatus as readNetworkStatus } from "../internal/network.service";

/** What the booth is connected to, what's around, and what it remembers. */
export const getNetworkStatus = darkroomProcedure.query(({ ctx }) =>
  readNetworkStatus(ctx.network),
);
