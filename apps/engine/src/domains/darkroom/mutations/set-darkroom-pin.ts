import { logKioskEvent } from "@dither-booth/logging";
import { darkroomPinSchema } from "@dither-booth/shared/darkroom";
import z from "zod";

import { configProcedure } from "#internal/trpc";

import { serializePinStatus } from "../internal/darkroom.access";
import { DARKROOM_LOG_SOURCE } from "../internal/darkroom.constants";

/**
 * Sets or changes the Darkroom PIN. Admin only: a Darkroom token can never
 * change the PIN. Every open Darkroom is signed out.
 */
export const setDarkroomPin = configProcedure
  .input(z.object({ pin: darkroomPinSchema }))
  .mutation(async ({ ctx, input }) => {
    await ctx.darkroomAccess.setPin(input.pin);
    logKioskEvent("info", DARKROOM_LOG_SOURCE, "darkroom-pin-changed");
    return serializePinStatus(ctx.darkroomAccess.getPinStatus());
  });
