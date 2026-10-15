import { configProcedure } from "#internal/trpc";

/** Whether a Darkroom PIN is set, and when it last changed. */
export const getDarkroomPinStatus = configProcedure.query(({ ctx }) =>
  ctx.darkroomAccess.getPinStatus(),
);
