import type {
  KioskErrorDiagnostics,
  KioskLogContext,
  KioskLogLevel,
  ReportKioskErrorOptions,
} from "./internal/logging.types";

import {
  getBrowserLoggingContext,
  getConsoleMethod,
  getErrorCauseMessage,
  hasDetails,
} from "./internal/logging.utils";

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

export type { ReportKioskErrorOptions };
