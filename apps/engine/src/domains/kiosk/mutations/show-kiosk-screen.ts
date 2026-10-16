import { logKioskEvent } from "@dither-booth/logging";
import { kioskScreenSchema } from "@dither-booth/shared/kiosk";
import { createId } from "@paralleldrive/cuid2";
import z from "zod";

import { opsProcedure } from "#internal/trpc";

import { KIOSK_LOG_SOURCE } from "../internal/kiosk.constants";

/**
 * Sends every connected kiosk page to a Shutter screen: the Darkroom, or
 * back to the guest-facing Shutter. Returns how many pages got the command.
 */
export const showKioskScreen = opsProcedure
  .input(z.object({ screen: kioskScreenSchema }))
  .mutation(({ ctx, input }) => {
    const commandId = createId();
    const delivered = ctx.kioskChannel.broadcast({
      type: "navigate",
      screen: input.screen,
      commandId,
    });

    logKioskEvent("info", KIOSK_LOG_SOURCE, "kiosk-navigate-sent", {
      details: { commandId, delivered, screen: input.screen },
    });

    return { delivered };
  });
