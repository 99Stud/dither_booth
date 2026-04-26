import type {
  BrowserKioskLoggingState,
  KioskErrorDiagnostics,
  KioskLogContext,
  KioskLogDetails,
  KioskLogLevel,
} from "./internal/logging.types";

const getConsoleMethod = (level: KioskLogLevel) => {
  if (level === "error") {
    return console.error;
  }

  if (level === "warn") {
    return console.warn;
  }

  return console.info;
};

const hasDetails = (details?: KioskLogDetails) => {
  return details !== undefined && Object.keys(details).length > 0;
};

const getErrorCauseMessage = (cause: unknown) => {
  if (cause instanceof Error) {
    return cause.message || cause.name;
  }

  if (typeof cause === "string" && cause.length > 0) {
    return cause;
  }

  return undefined;
};

const getBrowserLoggingContext = () => {
  return (
    (
      globalThis as typeof globalThis & {
        __ditherBoothKioskLoggingState?: BrowserKioskLoggingState;
      }
    ).__ditherBoothKioskLoggingState?.context ?? null
  );
};

export const getKioskErrorDiagnostics = (
  error: unknown,
  fallbackMessage: string,
): KioskErrorDiagnostics => {
  if (error instanceof Error) {
    const cause = getErrorCauseMessage(error.cause);

    return {
      ...(cause ? { cause } : {}),
      ...(error.name ? { name: error.name } : {}),
      message: error.message || fallbackMessage,
      ...(typeof error.stack === "string" && error.stack.length > 0
        ? { stack: error.stack }
        : {}),
    };
  }

  if (typeof error === "string" && error.length > 0) {
    return {
      message: error,
    };
  }

  return {
    message: fallbackMessage,
  };
};

export const logKioskEvent = (
  level: KioskLogLevel,
  source: string,
  event: string,
  context: KioskLogContext = {},
) => {
  const { details, error } = context;

  getConsoleMethod(level)("[kiosk]", {
    loggedAt: new Date().toISOString(),
    level,
    source,
    event,
    ...getBrowserLoggingContext(),
    ...(hasDetails(details) ? { details } : {}),
    ...(error ? { error } : {}),
  });
};

export type {
  BrowserKioskLogContext,
  BrowserKioskLoggingState,
  KioskErrorDiagnostics,
  KioskLogContext,
  KioskLogDetails,
  KioskLogLevel,
  ReportKioskErrorOptions,
} from "./internal/logging.types";
