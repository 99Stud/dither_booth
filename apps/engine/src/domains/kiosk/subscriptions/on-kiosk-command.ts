import { logKioskEvent } from "@dither-booth/logging";
import { kioskPageSchema } from "@dither-booth/shared/kiosk";
import { createId } from "@paralleldrive/cuid2";

import { boothProcedure } from "#internal/trpc";

import { KIOSK_LOG_SOURCE } from "../internal/kiosk.constants";

/**
 * The kiosk page's command stream, over SSE. Only the Experience and the
 * Darkroom subscribe, so the receipt-viewer page Puppeteer renders on never
 * does. It opens with the maintenance state, so a page that (re)connects is
 * locked or unlocked without waiting for the next switch, and with the
 * release, so a page loaded from an older one reloads.
 */
export const onKioskCommand = boothProcedure
  .input(kioskPageSchema)
  .subscription(async function* ({ ctx, input, signal }) {
    logKioskEvent("info", KIOSK_LOG_SOURCE, "kiosk-page-connected", {
      details: input,
    });

    try {
      // Read and subscribe in one synchronous step: a switch can't land in
      // between and be missed.
      const { enabled } = ctx.kioskMaintenance.get();
      yield* ctx.kioskChannel.subscribe(input, signal, [
        { type: "maintenance", enabled, commandId: createId() },
        { type: "release", release: ctx.release, commandId: createId() },
      ]);
    } finally {
      logKioskEvent("info", KIOSK_LOG_SOURCE, "kiosk-page-disconnected", {
        details: input,
      });
    }
  });
