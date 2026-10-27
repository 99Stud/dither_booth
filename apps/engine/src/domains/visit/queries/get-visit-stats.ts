import { configProcedure } from "#internal/trpc";

import { getVisitStatsForDb } from "../internal/visit.stats";

/** The active event's visit counts, for admin's Overview tiles. */
export const getVisitStats = configProcedure.query(({ ctx }) =>
  getVisitStatsForDb(ctx.db),
);
