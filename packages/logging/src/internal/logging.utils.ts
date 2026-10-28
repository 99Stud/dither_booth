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

/**
 * `bun run dev` sets `NODE_ENV=development`. There a human reads the
 * terminal, and nothing reads the output back: PM2 and its files are
 * production only.
 */
export const isDevelopmentRuntime = () => {
  // This package also builds for the browser, where `process` has no type.
  const runtime = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };

  return runtime.process?.env?.NODE_ENV === "development";
};

export const getBrowserLoggingContext = () => {
  if (!isBrowserRuntime()) {
    return null;
  }

  return window.__ditherBoothKioskLoggingState?.context ?? null;
};
