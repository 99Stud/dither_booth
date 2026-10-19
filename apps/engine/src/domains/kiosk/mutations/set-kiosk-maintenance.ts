import { logKioskEvent } from "@dither-booth/logging";
import z from "zod";

import { opsProcedure } from "#internal/trpc";

import { KIOSK_LOG_SOURCE } from "../internal/kiosk.constants";
import { serializeKioskMaintenance } from "../internal/kiosk.maintenance";

/**
 * Staff's maintenance switch. It is saved first, so a booth screen that is
 * offline picks it up when it connects; `delivered` counts the pages that got
 * it now. Turning it off leaves the booth in maintenance while the printer
 * still can't print.
 */
export const setKioskMaintenance = opsProcedure
  .input(z.object({ enabled: z.boolean() }))
  .mutation(({ ctx, input }) => {
    const { delivered, state } = ctx.kioskMaintenance.setManual(input.enabled);

    logKioskEvent("info", KIOSK_LOG_SOURCE, "kiosk-maintenance-set", {
      details: { delivered, manual: input.enabled, reasons: state.reasons },
    });

    return { delivered, ...serializeKioskMaintenance(state) };
  });
