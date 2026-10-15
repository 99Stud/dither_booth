import { boothProcedure } from "#internal/trpc";

/** Ends the caller's Darkroom session (its `x-darkroom-token`). */
export const lockDarkroom = boothProcedure.mutation(({ ctx }) => {
  ctx.darkroomAccess.lock(ctx.darkroomToken);
});
