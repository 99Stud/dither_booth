import type {
  BrowserKioskLogContext,
  KioskErrorDiagnostics,
  KioskLogDetails,
} from "./logging.types";

import {
  CLIENT_LOG_MAX_BODY_BYTES,
  CLIENT_LOG_ROUTE_PATH,
  CLIENT_LOG_TRIMMED_STACK_LENGTH,
  CLIENT_LOG_TRIMMED_TEXT_LENGTH,
} from "../client-log/client-log.constants";
import { serializeLogPayload } from "./logging.serialize";

type BrowserReport = BrowserKioskLogContext & {
  details?: KioskLogDetails;
  error?: KioskErrorDiagnostics;
  event: string;
  level: "error" | "warn";
  source: string;
};

const fitsInReport = (body: string) => {
  return new TextEncoder().encode(body).byteLength <= CLIENT_LOG_MAX_BODY_BYTES;
};

const trimError = (error: KioskErrorDiagnostics): KioskErrorDiagnostics => {
  return {
    ...(error.cause
      ? { cause: error.cause.slice(0, CLIENT_LOG_TRIMMED_TEXT_LENGTH) }
      : {}),
    ...(error.name ? { name: error.name } : {}),
    message: error.message.slice(0, CLIENT_LOG_TRIMMED_TEXT_LENGTH),
    ...(error.stack
      ? { stack: error.stack.slice(0, CLIENT_LOG_TRIMMED_STACK_LENGTH) }
      : {}),
  };
};

/**
 * The report body, secrets redacted. A report over the server's limit is
 * sent without its details and with its error cut short; `null` when even
 * that doesn't fit.
 */
const getReportBody = (report: BrowserReport) => {
  const body = serializeLogPayload(report);

  if (fitsInReport(body)) {
    return body;
  }

  const { details: _details, error, ...rest } = report;
  const trimmedBody = serializeLogPayload({
    ...rest,
    ...(error ? { error: trimError(error) } : {}),
  });

  return fitsInReport(trimmedBody) ? trimmedBody : null;
};

/**
 * Sends a browser warning or error to the server that served the page,
 * with a beacon so it survives the page closing. Does nothing before
 * browser logging is initialised, and never throws.
 */
export const sendBrowserReport = (
  context: BrowserKioskLogContext | null,
  report: Omit<BrowserReport, keyof BrowserKioskLogContext>,
) => {
  // Server packages type `navigator` without the DOM's `sendBeacon`.
  const navigator = window.navigator as
    | { sendBeacon?: (url: string, data: string) => boolean }
    | undefined;

  if (!context || typeof navigator?.sendBeacon !== "function") {
    return;
  }

  try {
    const body = getReportBody({
      ...report,
      deviceId: context.deviceId,
      runId: context.runId,
    });

    if (body) {
      navigator.sendBeacon(CLIENT_LOG_ROUTE_PATH, body);
    }
  } catch {
    // A failed report must never break the page or log again.
  }
};
