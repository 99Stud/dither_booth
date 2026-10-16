import { logKioskEvent } from "@dither-booth/logging";
import { createId } from "@paralleldrive/cuid2";
import z from "zod";

import { opsProcedure } from "#internal/trpc";

import { KIOSK_LOG_SOURCE } from "../internal/kiosk.constants";
import { serializeKioskMaintenance } from "../internal/kiosk.maintenance";

/**
 * Switches maintenance on or off. It is saved first, so a booth screen that
 * is offline picks it up when it connects; `delivered` counts the pages that
 * got it now.
 */
export const setKioskMaintenance = opsProcedure
  .input(z.object({ enabled: z.boolean() }))
  .mutation(({ ctx, input }) => {
    const state = ctx.kioskMaintenance.set(input.enabled);
    const commandId = createId();
    const delivered = ctx.kioskChannel.broadcast({
      type: "maintenance",
      enabled: input.enabled,
      commandId,
    });

    logKioskEvent("info", KIOSK_LOG_SOURCE, "kiosk-maintenance-set", {
      details: { commandId, delivered, enabled: input.enabled },
    });

    return { delivered, ...serializeKioskMaintenance(state) };
  });
