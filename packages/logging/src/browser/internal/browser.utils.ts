import {
  getKioskErrorDiagnostics,
  logKioskEvent,
  type BrowserKioskLoggingState,
  type KioskLogDetails,
} from "#index";

import {
  DEVICE_ID_STORAGE_KEY,
  GLOBAL_BROWSER_LOG_SOURCE,
  RUN_ID_STORAGE_KEY,
} from "./browser.constants";

export const getBrowserLoggingState = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const browserWindow = window as Window & {
    __ditherBoothKioskLoggingState?: BrowserKioskLoggingState;
  };

  browserWindow.__ditherBoothKioskLoggingState ??= {
    context: null,
    listenersRegistered: false,
  };

  return browserWindow.__ditherBoothKioskLoggingState;
};

export const getStoredValue = (key: string) => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const setStoredValue = (key: string, value: string) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage write failures and fall back to in-memory context.
  }
};

export const createDeviceId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `device-${Math.random().toString(36).slice(2, 10)}`;
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

export const getValueType = (value: unknown) => {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  if (value instanceof Error) {
    return "error";
  }

  return typeof value;
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
