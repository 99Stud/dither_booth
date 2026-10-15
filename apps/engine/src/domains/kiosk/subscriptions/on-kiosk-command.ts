import { logKioskEvent } from "@dither-booth/logging";
import { kioskPageSchema } from "@dither-booth/shared/kiosk";

import { boothProcedure } from "#internal/trpc";

import { KIOSK_LOG_SOURCE } from "../internal/kiosk.constants";

/**
 * The kiosk page's command stream, over SSE. Only the Experience route
 * subscribes, so the receipt-viewer page Puppeteer renders on never does.
 */
export const onKioskCommand = boothProcedure
  .input(kioskPageSchema)
  .subscription(async function* ({ ctx, input, signal }) {
    logKioskEvent("info", KIOSK_LOG_SOURCE, "kiosk-page-connected", {
      details: input,
    });

    try {
      yield* ctx.kioskChannel.subscribe(input, signal);
    } finally {
      logKioskEvent("info", KIOSK_LOG_SOURCE, "kiosk-page-disconnected", {
        details: input,
      });
    }
  });
