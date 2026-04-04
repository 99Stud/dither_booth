import { toast } from "sonner";

export type KioskLogLevel = "error" | "info" | "warn";

type ReportKioskErrorOptions = {
  details?: Record<string, unknown>;
  event: string;
  fallback: string;
  source: string;
};

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

export const reportKioskError = (
  error: unknown,
  options: ReportKioskErrorOptions,
) => {
  const { details, event, fallback, source } = options;
  const errorMessage = toErrorMessage(error, fallback);

  toast.error(errorMessage);
  logKioskEvent("error", source, event, {
    ...details,
    error: errorMessage,
  });

  return errorMessage;
};
