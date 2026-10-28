import { getErrorCauseMessage } from "@dither-booth/shared/errors";
import { hasDetails } from "@dither-booth/shared/runtime";

import type {
  KioskErrorDiagnostics,
  KioskLogContext,
  KioskLogLevel,
  ReportKioskErrorOptions,
} from "./internal/logging.types";

import { sendBrowserReport } from "./internal/logging.report";
import { serializeLogPayload } from "./internal/logging.serialize";
import {
  getBrowserLoggingContext,
  getConsoleMethod,
  isBrowserRuntime,
} from "./internal/logging.utils";
import { KIOSK_LOG_PREFIX } from "./isomorphic/kiosk-line";

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
  const { browser, details, error } = context;
  const payload = {
    loggedAt: new Date().toISOString(),
    level,
    source,
    event,
    ...getBrowserLoggingContext(),
    ...(browser
      ? { origin: "browser", deviceId: browser.deviceId, runId: browser.runId }
      : {}),
    ...(hasDetails(details) ? { details } : {}),
    ...(error ? { error } : {}),
  };

  if (isBrowserRuntime()) {
    getConsoleMethod(level)(KIOSK_LOG_PREFIX, payload);

    if (level !== "info") {
      sendBrowserReport(getBrowserLoggingContext(), {
        level,
        source,
        event,
        ...(hasDetails(details) ? { details } : {}),
        ...(error ? { error } : {}),
      });
    }

    return;
  }

  getConsoleMethod(level)(
    `${KIOSK_LOG_PREFIX} ${serializeLogPayload(payload)}`,
  );
};

export type { ReportKioskErrorOptions };
