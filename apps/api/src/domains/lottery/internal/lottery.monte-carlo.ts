import type { LotteryConfigRow, LotteryLotRow } from "./lottery.types";

import { type LotterySimulationProfile } from "./lottery.constants";
import {
  type LotterySimulationResult,
  simulateLotteryRun,
} from "./lottery.simulation";

export type MonteCarloSummary = {
  mean: number;
  min: number;
  p10: number;
  p50: number;
  p90: number;
  max: number;
};

export type LotteryMonteCarloResult = {
  profile: LotterySimulationProfile;
  samples: number;
  attemptsPerSample: number;
  totalSimulatedAttempts: number;
  wins: MonteCarloSummary;
  losses: MonteCarloSummary;
  forcedLosses: MonteCarloSummary;
  eligibleAttempts: MonteCarloSummary;
  effectiveWinRate: MonteCarloSummary;
  avgWinProbability: MonteCarloSummary;
  peakWinProbability: MonteCarloSummary;
  maxConsecutiveWins: MonteCarloSummary;
  saturatedShare: MonteCarloSummary;
  totalDistributedStock: MonteCarloSummary;
  totalRemainingStock: MonteCarloSummary;
  fullDepletionRate: number;
  abuseTriggeredRate: number;
  probCurve: Array<{
    elapsedPct: number;
    pPct: MonteCarloSummary;
    stockPct: MonteCarloSummary;
  }>;
  hourly: Array<{
    hour: string;
    attempts: MonteCarloSummary;
    wins: MonteCarloSummary;
    losses: MonteCarloSummary;
    forcedLosses: MonteCarloSummary;
    winRate: MonteCarloSummary;
  }>;
  byMinute: Array<{
    sortKey: number;
    minute: string;
    attempts: MonteCarloSummary;
    wins: MonteCarloSummary;
    losses: MonteCarloSummary;
    forcedLosses: MonteCarloSummary;
    winRate: MonteCarloSummary;
  }>;
  perLot: Array<{
    id: number;
    label: string;
    rarity: string;
    stockTotal: number;
    stockRemaining: MonteCarloSummary;
    distributed: MonteCarloSummary;
    distributionRate: MonteCarloSummary;
    coverageRate: number;
  }>;
};

const percentile = (values: number[], pct: number): number => {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = (sorted.length - 1) * pct;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower] ?? 0;
  const weight = idx - lower;
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * weight;
};

const summarize = (values: number[]): MonteCarloSummary => {
  if (values.length === 0) {
    return { mean: 0, min: 0, p10: 0, p50: 0, p90: 0, max: 0 };
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    mean,
    min: Math.min(...values),
    p10: percentile(values, 0.1),
    p50: percentile(values, 0.5),
    p90: percentile(values, 0.9),
    max: Math.max(...values),
  };
};

export const aggregateSimulationRuns = (
  runs: LotterySimulationResult[],
  meta: {
    profile: LotterySimulationProfile;
    samples: number;
    attemptsPerSample: number;
  },
): LotteryMonteCarloResult => {
  const { profile, samples, attemptsPerSample } = meta;

  const template = runs[0];
  if (!template) {
    return {
      profile,
      samples,
      attemptsPerSample,
      totalSimulatedAttempts: 0,
      wins: summarize([]),
      losses: summarize([]),
      forcedLosses: summarize([]),
      eligibleAttempts: summarize([]),
      effectiveWinRate: summarize([]),
      avgWinProbability: summarize([]),
      peakWinProbability: summarize([]),
      maxConsecutiveWins: summarize([]),
      saturatedShare: summarize([]),
      totalDistributedStock: summarize([]),
      totalRemainingStock: summarize([]),
      fullDepletionRate: 0,
      abuseTriggeredRate: 0,
      probCurve: [],
      hourly: [],
      byMinute: [],
      perLot: [],
    };
  }

  const totalSimulatedAttempts = samples * attemptsPerSample;
  const fullDepletionRate =
    runs.filter((run) => run.invariants.allLotsDistributed).length / runs.length;
  const abuseTriggeredRate =
    runs.filter((run) => run.forcedLosses > 0).length / runs.length;

  const probCurve = template.probCurve.map((point, index) => ({
    elapsedPct: point.elapsedPct,
    pPct: summarize(runs.map((run) => run.probCurve[index]?.pPct ?? 0)),
    stockPct: summarize(runs.map((run) => run.probCurve[index]?.stockPct ?? 0)),
  }));

  const hourly = template.hourly.map((bucket, index) => ({
    hour: bucket.hour,
    attempts: summarize(runs.map((run) => run.hourly[index]?.attempts ?? 0)),
    wins: summarize(runs.map((run) => run.hourly[index]?.wins ?? 0)),
    losses: summarize(runs.map((run) => run.hourly[index]?.losses ?? 0)),
    forcedLosses: summarize(
      runs.map((run) => run.hourly[index]?.forcedLosses ?? 0),
    ),
    winRate: summarize(runs.map((run) => run.hourly[index]?.winRate ?? 0)),
  }));

  const byMinute = template.byMinute.map((bucket, index) => ({
    sortKey: bucket.sortKey,
    minute: bucket.minute,
    attempts: summarize(runs.map((run) => run.byMinute[index]?.attempts ?? 0)),
    wins: summarize(runs.map((run) => run.byMinute[index]?.wins ?? 0)),
    losses: summarize(runs.map((run) => run.byMinute[index]?.losses ?? 0)),
    forcedLosses: summarize(
      runs.map((run) => run.byMinute[index]?.forcedLosses ?? 0),
    ),
    winRate: summarize(runs.map((run) => run.byMinute[index]?.winRate ?? 0)),
  }));

  const perLot = template.perLot.map((lot, index) => ({
    id: lot.id,
    label: lot.label,
    rarity: lot.rarity,
    stockTotal: lot.stockTotal,
    stockRemaining: summarize(
      runs.map((run) => run.perLot[index]?.stockRemaining ?? 0),
    ),
    distributed: summarize(runs.map((run) => run.perLot[index]?.distributed ?? 0)),
    distributionRate: summarize(
      runs.map((run) => run.perLot[index]?.distributionRate ?? 0),
    ),
    coverageRate:
      runs.filter((run) => (run.perLot[index]?.distributed ?? 0) > 0).length /
      runs.length,
  }));

  return {
    profile,
    samples,
    attemptsPerSample,
    totalSimulatedAttempts,
    wins: summarize(runs.map((run) => run.wins)),
    losses: summarize(runs.map((run) => run.losses)),
    forcedLosses: summarize(runs.map((run) => run.forcedLosses)),
    eligibleAttempts: summarize(runs.map((run) => run.eligibleAttempts)),
    effectiveWinRate: summarize(runs.map((run) => run.effectiveWinRate)),
    avgWinProbability: summarize(runs.map((run) => run.avgWinProbability)),
    peakWinProbability: summarize(runs.map((run) => run.peakWinProbability)),
    maxConsecutiveWins: summarize(runs.map((run) => run.maxConsecutiveWins)),
    saturatedShare: summarize(runs.map((run) => run.saturatedShare)),
    totalDistributedStock: summarize(
      runs.map((run) => run.totalDistributedStock),
    ),
    totalRemainingStock: summarize(runs.map((run) => run.totalRemainingStock)),
    fullDepletionRate,
    abuseTriggeredRate,
    probCurve,
    hourly,
    byMinute,
    perLot,
  };
};

export const runMonteCarloLotterySimulation = (input: {
  attempts: number;
  profile: LotterySimulationProfile;
  samples: number;
  config: LotteryConfigRow;
  lots: LotteryLotRow[];
}): LotteryMonteCarloResult => {
  const { attempts, profile, samples, config, lots } = input;

  const runs = Array.from({ length: samples }, () =>
    simulateLotteryRun({
      attempts,
      profile,
      config: { ...config },
      lots: lots.map((lot) => ({ ...lot })),
    }),
  );

  return aggregateSimulationRuns(runs, {
    profile,
    samples,
    attemptsPerSample: attempts,
  });
};
