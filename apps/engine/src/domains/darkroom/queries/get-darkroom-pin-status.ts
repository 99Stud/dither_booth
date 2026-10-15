import { configProcedure } from "#internal/trpc";

import { serializePinStatus } from "../internal/darkroom.access";

/** Whether a Darkroom PIN is set, and when it last changed. */
export const getDarkroomPinStatus = configProcedure.query(({ ctx }) =>
  serializePinStatus(ctx.darkroomAccess.getPinStatus()),
);
