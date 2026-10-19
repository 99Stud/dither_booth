/** No network for this long: the booth opens its own Wi-Fi. */
export const OFFLINE_GRACE_MS = 45_000;
/**
 * The hotspot with nobody on it for this long: drop it so NetworkManager can
 * try the saved networks again (a venue router that came up after the booth).
 */
export const HOTSPOT_IDLE_RETRY_MS = 3 * 60_000;

export type WatchInput = {
  now: number;
  /** wifi/ethernet: a network someone else runs. */
  online: boolean;
  hotspotActive: boolean;
  connecting: boolean;
  /** Devices on the booth's Wi-Fi. */
  stations: number;
  /** Staff chose booth Wi-Fi, or a double power-cycle forced it. */
  holdHotspot: boolean;
};

export type WatchState = {
  offlineSince: number | null;
  hotspotIdleSince: number | null;
};

export type WatchAction = "none" | "start-hotspot" | "retry-saved-networks";

export const INITIAL_WATCH_STATE: WatchState = {
  hotspotIdleSince: null,
  offlineSince: null,
};

/** One tick of the network watch: what to do, and what to remember. */
export function decideNetworkAction(
  input: WatchInput,
  state: WatchState,
): { action: WatchAction; state: WatchState } {
  // Joining a network the staff picked: never fight it.
  if (input.connecting) {
    return { action: "none", state: INITIAL_WATCH_STATE };
  }

  if (input.holdHotspot) {
    return {
      action: input.hotspotActive ? "none" : "start-hotspot",
      state: INITIAL_WATCH_STATE,
    };
  }

  if (input.hotspotActive) {
    if (input.stations > 0 || input.online) {
      return { action: "none", state: INITIAL_WATCH_STATE };
    }

    const idleSince = state.hotspotIdleSince ?? input.now;

    if (input.now - idleSince >= HOTSPOT_IDLE_RETRY_MS) {
      return {
        action: "retry-saved-networks",
        state: { hotspotIdleSince: null, offlineSince: input.now },
      };
    }
    return {
      action: "none",
      state: { hotspotIdleSince: idleSince, offlineSince: null },
    };
  }

  if (input.online) {
    return { action: "none", state: INITIAL_WATCH_STATE };
  }

  const offlineSince = state.offlineSince ?? input.now;

  if (input.now - offlineSince >= OFFLINE_GRACE_MS) {
    return { action: "start-hotspot", state: INITIAL_WATCH_STATE };
  }
  return {
    action: "none",
    state: { hotspotIdleSince: null, offlineSince },
  };
}
