import { getKioskCameraHealth } from "@dither-booth/shared/kiosk";

import type { KioskChannel } from "./kiosk.channel";

import { KIOSK_STATUS_STALE_AFTER_MS } from "./kiosk.constants";

export type KioskCameraState = {
  /**
   * A kiosk page is there (reported within `staleAfterMs`) and no page's
   * camera failed.
   */
  on: boolean;
  /** When `on` last flipped: the engine's start until it first does. */
  changedAt: Date;
};

/**
 * Whether the booth has its camera, as the Hub's Camera off alert reads it.
 * On while a kiosk page (the Experience, the Darkroom) has reported within
 * `staleAfterMs` and none reports a failed camera: the same judgement as
 * admin's Camera health item, plus "is the iPad there at all". Off when no
 * page reports any more (the iPad off, asleep or out of Wi-Fi, the Shutter
 * closed) or a camera failed. A page in the Darkroom's PIN screen runs no
 * camera and counts as there.
 *
 * A vanished iPad closes nothing, so its page is only known gone once its
 * reports stop: `changedAt` is then when the engine noticed, up to
 * `checkIntervalMs` after the last report went stale.
 */
export type KioskCamera = {
  get: () => KioskCameraState;
  /** Calls `listener` whenever `on` flips; returns an unsubscribe. */
  subscribe: (listener: (state: KioskCameraState) => void) => () => void;
  stop: () => void;
};

/** How often stale reports are looked for. */
const CHECK_INTERVAL_MS = 15_000;

export function createKioskCamera({
  kioskChannel,
  staleAfterMs = KIOSK_STATUS_STALE_AFTER_MS,
  checkIntervalMs = CHECK_INTERVAL_MS,
  now = () => new Date(),
}: {
  kioskChannel: Pick<KioskChannel, "listPages" | "onPagesChanged">;
  staleAfterMs?: number;
  checkIntervalMs?: number;
  now?: () => Date;
}): KioskCamera {
  const listeners = new Set<(state: KioskCameraState) => void>();
  let state: KioskCameraState = { on: false, changedAt: now() };

  const isOn = () => {
    const since = now().getTime() - staleAfterMs;
    const present = kioskChannel
      .listPages()
      .filter(
        (page) => (page.reportedAt ?? page.connectedAt).getTime() > since,
      );
    return present.length > 0 && getKioskCameraHealth(present) !== false;
  };

  /** Reads the pages now and records a flip, if there is one. */
  const refresh = () => {
    const on = isOn();
    if (on === state.on) return state;
    state = { on, changedAt: now() };
    for (const listener of listeners) listener(state);
    return state;
  };

  const unsubscribe = kioskChannel.onPagesChanged(refresh);
  const timer = setInterval(refresh, checkIntervalMs);
  timer.unref();

  return {
    get: refresh,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop() {
      clearInterval(timer);
      unsubscribe();
    },
  };
}
