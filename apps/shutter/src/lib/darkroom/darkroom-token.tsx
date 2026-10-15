import type { DarkroomUnlock } from "@dither-booth/shared/darkroom";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "dither-booth.darkroom-token";

/**
 * The Darkroom session token. Kept in sessionStorage so it survives a page
 * reload (e.g. a kiosk reload) but not the tab, and never outlives the
 * engine's own expiry for long: the engine refuses it once it has expired.
 */
let current: DarkroomUnlock | null = readStored();
const listeners = new Set<() => void>();

function readStored(): DarkroomUnlock | null {
  try {
    const raw =
      typeof window === "undefined"
        ? null
        : window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DarkroomUnlock) : null;
  } catch {
    return null;
  }
}

function write(next: DarkroomUnlock | null) {
  current = next;
  try {
    if (next) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage can be unavailable (private mode); the in-memory copy is enough.
  }
  for (const listener of listeners) listener();
}

export const getDarkroomToken = () => current?.token;

export const setDarkroomSession = (unlock: DarkroomUnlock) => write(unlock);

export const clearDarkroomSession = () => write(null);

/** Whether the Darkroom is unlocked in this tab. */
export const useDarkroomSession = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );
