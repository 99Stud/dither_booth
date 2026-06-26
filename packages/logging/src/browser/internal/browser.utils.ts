import {
  getStoredValue,
  setStoredValue,
} from "@dither-booth/shared/browser/storage";
import { createDeviceId } from "@dither-booth/shared/id";
import { getValueType } from "@dither-booth/shared/runtime";

import type { KioskLogDetails } from "#internal/logging.types";

import { getKioskErrorDiagnostics, logKioskEvent } from "#index";

import {
  DEVICE_ID_STORAGE_KEY,
  GLOBAL_BROWSER_LOG_SOURCE,
  RUN_ID_STORAGE_KEY,
} from "./browser.constants";

export const getBrowserLoggingState = () => {
  if (typeof window === "undefined") {
    return null;
  }

  window.__ditherBoothKioskLoggingState ??= {
    context: null,
    listenersRegistered: false,
  };

  return window.__ditherBoothKioskLoggingState;
};

export const getOrCreateDeviceId = () => {
  const storedDeviceId = getStoredValue(DEVICE_ID_STORAGE_KEY);
  if (storedDeviceId) {
    return storedDeviceId;
  }

  const deviceId = createDeviceId();
  setStoredValue(DEVICE_ID_STORAGE_KEY, deviceId);
  return deviceId;
};

export const getNextRunId = () => {
  const storedRunId = getStoredValue(RUN_ID_STORAGE_KEY);
  const previousRunId = storedRunId ? Number.parseInt(storedRunId, 10) : 0;
  const runId =
    Number.isSafeInteger(previousRunId) && previousRunId > 0
      ? previousRunId + 1
      : 1;

  setStoredValue(RUN_ID_STORAGE_KEY, String(runId));
  return runId;
};

export const getWindowErrorDetails = (
  errorEvent: ErrorEvent,
): KioskLogDetails => {
  const details: KioskLogDetails = {};

  if (errorEvent.filename) {
    details.filename = errorEvent.filename;
  }

  if (errorEvent.lineno > 0) {
    details.lineno = errorEvent.lineno;
  }

  if (errorEvent.colno > 0) {
    details.colno = errorEvent.colno;
  }

  return details;
};

export const registerGlobalBrowserFailureHandlers = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.addEventListener("error", (errorEvent) => {
    logKioskEvent("error", GLOBAL_BROWSER_LOG_SOURCE, "window-error", {
      details: getWindowErrorDetails(errorEvent),
      error: getKioskErrorDiagnostics(
        errorEvent.error ?? errorEvent.message,
        errorEvent.message || "Unhandled browser error.",
      ),
    });
  });

  window.addEventListener("unhandledrejection", (rejectionEvent) => {
    logKioskEvent(
      "error",
      GLOBAL_BROWSER_LOG_SOURCE,
      "unhandled-promise-rejection",
      {
        details: {
          reasonType: getValueType(rejectionEvent.reason),
        },
        error: getKioskErrorDiagnostics(
          rejectionEvent.reason,
          "Promise rejection was not handled.",
        ),
      },
    );
  });
};
