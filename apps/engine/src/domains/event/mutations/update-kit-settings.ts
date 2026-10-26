import { logKioskEvent } from "@dither-booth/logging";

import { configProcedure } from "#internal/trpc";

import {
  EVENT_LOG_SOURCE,
  updateKitSettingsInputSchema,
} from "../internal/event.constants";
import { notifyKiosk } from "../internal/event.kiosk";
import { updateKitSettingsForDb } from "../internal/event.service";

/**
 * Saves the event's kit and its edits, then tells every kiosk page to re-read
 * the kit. `delivered` is how many pages got that: 0 means no kiosk page is
 * connected, and the change shows the next time one loads.
 */
export const updateKitSettings = configProcedure
  .input(updateKitSettingsInputSchema)
  .mutation(async ({ ctx, input }) => {
    const event = await updateKitSettingsForDb(ctx.db, input);
    const { commandId, delivered } = notifyKiosk(
      ctx.kioskChannel,
      "kit-updated",
    );

    logKioskEvent("info", EVENT_LOG_SOURCE, "event-kit-settings-saved", {
      details: { commandId, delivered, kitId: input.kitId },
    });

    return { event, delivered };
  });
