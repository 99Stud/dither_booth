import {
  isThemePreference,
  type ThemePreference,
} from "@dither-booth/ui/components/misc/ThemeToggle";
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "dither-booth.darkroom-theme";
/** The booth is usually dim, so the Darkroom starts dark. */
const DEFAULT_PREFERENCE: ThemePreference = "dark";

const listeners = new Set<() => void>();
let preference: ThemePreference = readStored();

function readStored(): ThemePreference {
  try {
    const stored =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(STORAGE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_PREFERENCE;
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

const prefersDark = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

const notify = () => {
  for (const listener of listeners) listener();
};

if (typeof window !== "undefined") {
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", notify);
}

export const setDarkroomThemePreference = (next: ThemePreference) => {
  preference = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage can be unavailable; the choice still holds for this page.
  }
  notify();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * The Darkroom's Light / Dark / System choice, kept apart from the kiosk:
 * it only applies while /darkroom is open (Root sets the classes).
 */
export const useDarkroomTheme = () => {
  const current = useSyncExternalStore(
    subscribe,
    () => preference,
    () => DEFAULT_PREFERENCE,
  );
  const isDark = useSyncExternalStore(
    subscribe,
    () => (current === "system" ? prefersDark() : current === "dark"),
    () => true,
  );

  return {
    preference: current,
    resolved: isDark ? ("dark" as const) : ("light" as const),
    setPreference: setDarkroomThemePreference,
  };
};
