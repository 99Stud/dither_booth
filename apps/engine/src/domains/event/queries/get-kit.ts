import { boothProcedure } from "#internal/trpc";

import { getKitForDb } from "../internal/event.service";

/**
 * The kit the kiosk and the tickets render, with the event's edits applied.
 * Public: it holds only what the booth shows anyway.
 */
export const getKit = boothProcedure.query(async ({ ctx }) => {
  return await getKitForDb(ctx.db);
});
