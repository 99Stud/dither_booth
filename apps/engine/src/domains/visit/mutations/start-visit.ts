import { boothProcedure } from "#internal/trpc";

/** Start pressed on the kiosk. A null `visitId` means it wasn't recorded. */
export const startVisit = boothProcedure.mutation(({ ctx }) =>
  ctx.visits.start(),
);
