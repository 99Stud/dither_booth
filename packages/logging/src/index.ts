import { getErrorCauseMessage } from "@dither-booth/shared/errors";
import { hasDetails } from "@dither-booth/shared/runtime";

import type {
  KioskErrorDiagnostics,
  KioskLogContext,
  KioskLogLevel,
  ReportKioskErrorOptions,
} from "./internal/logging.types";

import { KIOSK_LOG_PREFIX } from "./internal/logging.constants";
import { serializeLogPayload } from "./internal/logging.serialize";
import {
  getBrowserLoggingContext,
  getConsoleMethod,
  isBrowserRuntime,
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
  const payload = {
    loggedAt: new Date().toISOString(),
    level,
    source,
    event,
    ...getBrowserLoggingContext(),
    ...(hasDetails(details) ? { details } : {}),
    ...(error ? { error } : {}),
  };

  if (isBrowserRuntime()) {
    getConsoleMethod(level)(KIOSK_LOG_PREFIX, payload);
    return;
  }

  getConsoleMethod(level)(
    `${KIOSK_LOG_PREFIX} ${serializeLogPayload(payload)}`,
  );
};

export type { ReportKioskErrorOptions };
