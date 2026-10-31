import type { KioskChannel } from "./kiosk.channel";

export type KioskCameraState = {
  /** A connected kiosk page reports a camera showing a picture. */
  ready: boolean;
  /** When `ready` last flipped: the engine's start until it first does. */
  changedAt: Date;
};

/**
 * Whether the booth has a working camera, as the Hub's Camera off alert
 * reads it: ready while any connected kiosk page (the Experience, or the
 * Darkroom's print tuning) reports its camera `ready`, as admin's Camera
 * health item and the live view judge it. Off means no page is connected
 * (the iPad off or asleep, the Shutter closed) or every camera failed.
 */
export type KioskCamera = {
  get: () => KioskCameraState;
  /** Calls `listener` whenever `ready` flips; returns an unsubscribe. */
  subscribe: (listener: (state: KioskCameraState) => void) => () => void;
};

export function createKioskCamera({
  kioskChannel,
  now = () => new Date(),
}: {
  kioskChannel: Pick<KioskChannel, "listPages" | "onPagesChanged">;
  now?: () => Date;
}): KioskCamera {
  const listeners = new Set<(state: KioskCameraState) => void>();
  let state: KioskCameraState = { ready: false, changedAt: now() };

  const isReady = () =>
    kioskChannel.listPages().some((page) => page.camera?.status === "ready");

  kioskChannel.onPagesChanged(() => {
    const ready = isReady();
    if (ready === state.ready) return;
    state = { ready, changedAt: now() };
    for (const listener of listeners) listener(state);
  });

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
