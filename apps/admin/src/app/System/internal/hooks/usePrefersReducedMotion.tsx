import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

const subscribe = (onChange: () => void) => {
  const list = window.matchMedia(QUERY);

  list.addEventListener("change", onChange);

  return () => list.removeEventListener("change", onChange);
};

const getSnapshot = () => window.matchMedia(QUERY).matches;

/** True when the OS asks for less motion: every tween then sets its value at once. */
export const usePrefersReducedMotion = () =>
  useSyncExternalStore(subscribe, getSnapshot, () => true);
