import { logKioskEvent } from "@dither-booth/logging";
import { kioskReloadModeSchema } from "@dither-booth/shared/kiosk";
import { createId } from "@paralleldrive/cuid2";
import z from "zod";

import { opsProcedure } from "#internal/trpc";

import { KIOSK_LOG_SOURCE } from "../internal/kiosk.constants";

/**
 * Asks every connected kiosk page to reload. Returns how many pages got the
 * command: 0 means no kiosk page is connected right now.
 */
export const reloadKiosk = opsProcedure
  .input(z.object({ mode: kioskReloadModeSchema }))
  .mutation(({ ctx, input }) => {
    const commandId = createId();
    const delivered = ctx.kioskChannel.broadcast({
      type: "reload",
      mode: input.mode,
      commandId,
    });

    logKioskEvent("info", KIOSK_LOG_SOURCE, "kiosk-reload-sent", {
      details: { commandId, delivered, mode: input.mode },
    });

    return { delivered };
  });
