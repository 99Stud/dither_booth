import type { KioskCommand } from "@dither-booth/shared/kiosk";

import { logKioskEvent } from "@dither-booth/logging";
import { createId } from "@paralleldrive/cuid2";

import type { KioskChannel } from "#domains/kiosk/kiosk.service";

import { configProcedure } from "#internal/trpc";

import { EVENT_LOG_SOURCE } from "./event.constants";

/** What an event save can change on the kiosk, each re-read on its own. */
type EventKioskCommandType = Extract<
  KioskCommand["type"],
  "kit-updated" | "lottery-updated"
>;

/**
 * Tells every kiosk page to re-read what changed. `delivered` is how many
 * pages got it: 0 means none is connected, and the change shows the next time
 * one loads.
 */
export const notifyKiosk = (
  kioskChannel: Pick<KioskChannel, "broadcast">,
  type: EventKioskCommandType,
) => {
  const commandId = createId();
  const delivered = kioskChannel.broadcast({ type, commandId });

  return { commandId, delivered };
};

/**
 * Event authoring that notifies the kiosk once the save has succeeded. A
 * lottery change also tells the Hub at once if the lottery ran out or has
 * prizes again.
 */
const notifyingConfigProcedure = (types: EventKioskCommandType[]) =>
  configProcedure.use(async ({ ctx, next, path }) => {
    const result = await next();

    if (result.ok) {
      if (types.includes("lottery-updated")) {
        void ctx.hubReporter.lotteryChanged();
      }

      for (const type of types) {
        const { commandId, delivered } = notifyKiosk(ctx.kioskChannel, type);

        logKioskEvent("info", EVENT_LOG_SOURCE, "event-kiosk-notified", {
          details: { commandId, delivered, path, type },
        });
      }
    }

    return result;
  });

/** Changes what the landing's lottery panel shows: switch, odds, prizes, stock. */
export const lotteryConfigProcedure = notifyingConfigProcedure([
  "lottery-updated",
]);

/** A new active event: a new kit and a new lottery at once. */
export const newEventConfigProcedure = notifyingConfigProcedure([
  "kit-updated",
  "lottery-updated",
]);
