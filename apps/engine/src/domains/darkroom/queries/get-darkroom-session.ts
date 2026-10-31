import type { DarkroomSession } from "@dither-booth/shared/darkroom";

import { boothProcedure } from "#internal/trpc";

/**
 * Whether a staff PIN is set, and whether the caller's token is live (which
 * keeps it live). Admin asks it to show its PIN screen; the admin server, to
 * guard its own routes.
 */
export const getDarkroomSession = boothProcedure.query(
  ({ ctx }): DarkroomSession => ({
    pinSet: ctx.darkroomAccess.getPinStatus().isSet,
    signedIn: ctx.darkroomAccess.verify(ctx.darkroomToken),
  }),
);
