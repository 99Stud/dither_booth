import { logKioskEvent } from "@dither-booth/logging";
import z from "zod";

import { opsProcedure } from "#internal/trpc";

import { KIOSK_LOG_SOURCE } from "../internal/kiosk.constants";
import { serializeKioskMaintenance } from "../internal/kiosk.maintenance";

/**
 * Whether a printer that can't print puts the booth in maintenance. Off is
 * the escape hatch for a sensor that misbehaves: guests can start a visit and
 * the printer only refuses a job when it isn't connected. Not saved: the
 * engine starts with it on in production.
 */
export const setAutomaticMaintenance = opsProcedure
  .input(z.object({ enabled: z.boolean() }))
  .mutation(({ ctx, input }) => {
    const state = ctx.kioskMaintenance.setAutomatic(input.enabled);

    logKioskEvent("info", KIOSK_LOG_SOURCE, "kiosk-automatic-maintenance-set", {
      details: { automatic: input.enabled, reasons: state.reasons },
    });

    return serializeKioskMaintenance(state);
  });
