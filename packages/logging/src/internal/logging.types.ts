export type KioskLogLevel = "error" | "info" | "warn";

export type KioskLogDetails = Record<string, unknown>;

export type KioskErrorDiagnostics = {
  cause?: string;
  message: string;
  name?: string;
  stack?: string;
};

export type BrowserKioskLogContext = {
  deviceId: string;
  runId: number;
};

export type BrowserKioskLoggingState = {
  context: BrowserKioskLogContext | null;
  listenersRegistered: boolean;
};

export type KioskLogContext = {
  /**
   * Set by a server re-logging a browser report: the line is marked
   * `origin: "browser"` and carries the reporting device's ids.
   */
  browser?: BrowserKioskLogContext;
  details?: KioskLogDetails;
  error?: KioskErrorDiagnostics;
};

export type ReportKioskErrorOptions = {
  details?: KioskLogDetails;
  event: string;
  source: string;
  userMessage: string;
};

declare global {
  interface Window {
    __ditherBoothKioskLoggingState?: BrowserKioskLoggingState;
  }

  var window: Window & typeof globalThis;
}
