import type { KioskLogLevel } from "./logging.types";

export const getConsoleMethod = (level: KioskLogLevel) => {
  if (level === "error") {
    return console.error;
  }

  if (level === "warn") {
    return console.warn;
  }

  return console.info;
};

export const getBrowserLoggingContext = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.__ditherBoothKioskLoggingState?.context ?? null;
};
