import type { HubReporter } from "./hub-reporter";

/** A reporter that never reports, for contexts that don't use the Hub. */
export const createHubReporterStub = (): HubReporter => ({
  start: () => {},
  stop: () => {},
  report: () => Promise.resolve(),
  lotteryChanged: () => Promise.resolve(),
  getState: () => ({ lastReportedAt: null, lastError: null }),
});

/** A stub that counts its `lotteryChanged` calls. */
export const createLotteryCountingHubReporter = () => {
  const counted = { lotteryChanged: 0 };
  const reporter: HubReporter = {
    ...createHubReporterStub(),
    lotteryChanged: async () => {
      counted.lotteryChanged += 1;
    },
  };
  return { reporter, counted };
};
