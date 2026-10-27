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

export const isBrowserRuntime = () => {
  return typeof window !== "undefined";
};

export const getBrowserLoggingContext = () => {
  if (!isBrowserRuntime()) {
    return null;
  }

  return window.__ditherBoothKioskLoggingState?.context ?? null;
};
