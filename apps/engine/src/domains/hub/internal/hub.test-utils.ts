import type { HubReporter } from "./hub-reporter";

/** A reporter that never reports, for contexts that don't use the Hub. */
export const createHubReporterStub = (): HubReporter => ({
  start: () => {},
  stop: () => {},
  report: () => Promise.resolve(),
  getState: () => ({ lastReportedAt: null, lastError: null }),
});
