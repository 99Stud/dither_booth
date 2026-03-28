export type KioskLogLevel = "error" | "info" | "warn";

const getConsoleMethod = (level: KioskLogLevel) => {
  if (level === "error") {
    return console.error;
  }

  if (level === "warn") {
    return console.warn;
  }

  return console.info;
};

export const createCorrelationId = (prefix: string) => {
  if (
    typeof crypto !== "undefined" &&
    "randomUUID" in crypto &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
};

export const logKioskEvent = (
  level: KioskLogLevel,
  source: string,
  event: string,
  details: Record<string, unknown> = {},
) => {
  getConsoleMethod(level)("[kiosk]", {
    loggedAt: new Date().toISOString(),
    level,
    source,
    event,
    ...details,
  });
};

export const toErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};
