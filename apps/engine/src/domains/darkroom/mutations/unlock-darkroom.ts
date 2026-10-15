import { logKioskEvent } from "@dither-booth/logging";
import { darkroomPinSchema } from "@dither-booth/shared/darkroom";
import { TRPCError } from "@trpc/server";
import z from "zod";

import { boothProcedure } from "#internal/trpc";

import { DARKROOM_LOG_SOURCE } from "../internal/darkroom.constants";

/** Trades the Darkroom PIN for a short-lived token. */
export const unlockDarkroom = boothProcedure
  .input(z.object({ pin: darkroomPinSchema }))
  .mutation(async ({ ctx, input }) => {
    try {
      const unlocked = await ctx.darkroomAccess.unlock(input.pin);
      logKioskEvent("info", DARKROOM_LOG_SOURCE, "darkroom-unlocked", {
        details: { expiresAt: unlocked.expiresAt },
      });
      return unlocked;
    } catch (error) {
      if (error instanceof TRPCError) {
        logKioskEvent("warn", DARKROOM_LOG_SOURCE, "darkroom-unlock-refused", {
          details: { code: error.code },
        });
      }
      throw error;
    }
  });
