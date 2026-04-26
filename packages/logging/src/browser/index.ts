import {
  getBrowserLoggingState,
  getNextRunId,
  getOrCreateDeviceId,
  registerGlobalBrowserFailureHandlers,
} from "./internal/browser.utils";

export const initializeBrowserLogging = () => {
  const browserLoggingState = getBrowserLoggingState();

  if (!browserLoggingState) {
    return null;
  }

  if (!browserLoggingState.context) {
    browserLoggingState.context = {
      deviceId: getOrCreateDeviceId(),
      runId: getNextRunId(),
    };
  }

  if (!browserLoggingState.listenersRegistered) {
    registerGlobalBrowserFailureHandlers();
    browserLoggingState.listenersRegistered = true;
  }

  return browserLoggingState.context;
};
