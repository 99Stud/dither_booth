import type { KioskLogDetails, KioskLogLevel } from "./logging.types";

export const getConsoleMethod = (level: KioskLogLevel) => {
  if (level === "error") {
    return console.error;
  }

  if (level === "warn") {
    return console.warn;
  }

  return console.info;
};

export const hasDetails = (details?: KioskLogDetails) => {
  return details !== undefined && Object.keys(details).length > 0;
};

export const getErrorCauseMessage = (cause: unknown) => {
  if (cause instanceof Error) {
    return cause.message || cause.name;
  }

  if (typeof cause === "string" && cause.length > 0) {
    return cause;
  }

  return undefined;
};

export const getBrowserLoggingContext = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.__ditherBoothKioskLoggingState?.context ?? null;
};
