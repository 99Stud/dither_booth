import { simulateLotteryRun } from "./lottery.simulation";
import type { LotteryConfigRow, LotteryLotRow } from "./lottery.types";

export const rarityWeight = (
  rarity: string,
  weights: LotteryTuneWeights,
): number => {
  switch (rarity) {
    case "common":
      return weights.common;
    case "medium":
      return weights.medium;
    case "rare":
      return weights.rare;
    case "very_rare":
      return weights.very_rare;
    default:
      return weights.common;
  }
};

export const inventoryLinesFromLots = (lots: LotteryLotRow[]): string[] =>
  lots
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map((l) => `${l.label} ×${l.stockTotal} (${l.rarity})`);

const baseConfigTemplate: Omit<LotteryConfigRow, "id"> = {
  enabled: true,
  startTime: "16:00",
  endTime: "21:00",
  baseWinPressure: 0.15,
  maxBoost: 3,
  abuseWindowSeconds: 60,
  abuseMaxAttempts: 5,
  abuseMinIntervalSeconds: 10,
  abuseCooldownSeconds: 120,
};

const cloneLotsWithRarityWeights = (
  lots: LotteryLotRow[],
  weights: LotteryTuneWeights,
): LotteryLotRow[] =>
  lots.map((lot) => ({
    ...lot,
    stockRemaining: lot.stockTotal,
    baseWeight: rarityWeight(lot.rarity, weights),
  }));

const createRng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
};

const randRange = (rng: () => number, min: number, max: number) =>
  min + rng() * (max - min);

const stdDev = (values: number[]): number => {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

/**
 * Tuner objective. Balances:
 *   - depletion (consume stock before window closes)
 *   - dispersion (no long win streaks, no saturated P regime)
 *   - abuse friendliness (fewer forced losses)
 *   - time uniformity (low hourly jitter)
 *
 * No hard cliff: every signal contributes continuously so the optimizer
 * converges on parameters that are "good enough" on every axis rather than
 * maxing out one at the expense of others.
 */
const scoreRun = (
  result: ReturnType<typeof simulateLotteryRun>,
): number => {
  const hourlyWinRates = result.hourly
    .filter((h) => h.attempts > 0)
    .map((h) => h.winRate);
  const winRateJitter = stdDev(hourlyWinRates);

  const remainingShare =
    result.totalInitialStock > 0
      ? result.totalRemainingStock / result.totalInitialStock
      : 0;
  const minLotDistribution = result.perLot.length
    ? Math.min(...result.perLot.map((l) => l.distributionRate))
    : 0;

  let score = 1_000_000;

  score -= remainingShare ** 2 * 800_000;
  score -= (1 - minLotDistribution) * 50_000;

  score -= result.forcedLosses * 1500;
  score -= winRateJitter * 30_000;

  score -= Math.max(0, result.peakWinProbability - 0.7) * 400_000;
  score -= Math.max(0, result.avgWinProbability - 0.4) * 250_000;
  score -= result.saturatedShare * 600_000;

  score -= Math.max(0, result.maxConsecutiveWins - 6) * 6_000;

  return score;
};

export type LotteryTuneWeights = {
  common: number;
  medium: number;
  rare: number;
  very_rare: number;
};

export type LotteryTuneCandidateSummary = {
  rank: number;
  score: number;
  baseWinPressure: number;
  maxBoost: number;
  weights: LotteryTuneWeights;
  wins: number;
  losses: number;
  forcedLosses: number;
  allLotsDistributed: boolean;
  totalRemainingStock: number;
  hourlyWinRateStd: number;
  /** Highest P(win) observed in the simulation run (0–1). */
  peakWinProbability: number;
  /** Mean P(win) across eligible draws (0–1). */
  avgWinProbability: number;
  /** Share of eligible draws where P(win) ≥ 0.99. */
  saturatedShare: number;
  /** Longest consecutive WIN streak in the run. */
  maxConsecutiveWins: number;
  perLot: Array<{
    label: string;
    distributed: number;
    stockTotal: number;
    distributionRate: number;
  }>;
};

export type LotteryTuneRecommended = {
  baseWinPressure: number;
  maxBoost: number;
  lots: Array<{ id: number; label: string; baseWeight: number }>;
};

export type LotteryTuneSearchResult = {
  samples: number;
  attempts: number;
  seed: number;
  inventoryLines: string[];
  top: LotteryTuneCandidateSummary[];
  recommended: LotteryTuneRecommended | null;
};

const toRecommended = (
  weights: LotteryTuneWeights,
  sourceLots: LotteryLotRow[],
): LotteryTuneRecommended["lots"] =>
  sourceLots.map((l) => ({
    id: l.id,
    label: l.label,
    baseWeight: Number(rarityWeight(l.rarity, weights).toFixed(4)),
  }));

const summarizeCandidate = (
  rank: number,
  score: number,
  baseWinPressure: number,
  maxBoost: number,
  weights: LotteryTuneWeights,
  result: ReturnType<typeof simulateLotteryRun>,
): LotteryTuneCandidateSummary => {
  const hourlyWinRates = result.hourly
    .filter((h) => h.attempts > 0)
    .map((h) => h.winRate);

  return {
    rank,
    score,
    baseWinPressure,
    maxBoost,
    weights: {
      common: weights.common,
      medium: weights.medium,
      rare: weights.rare,
      very_rare: weights.very_rare,
    },
    wins: result.wins,
    losses: result.losses,
    forcedLosses: result.forcedLosses,
    allLotsDistributed: result.invariants.allLotsDistributed,
    totalRemainingStock: result.totalRemainingStock,
    hourlyWinRateStd: stdDev(hourlyWinRates),
    peakWinProbability: result.peakWinProbability,
    avgWinProbability: result.avgWinProbability,
    saturatedShare: result.saturatedShare,
    maxConsecutiveWins: result.maxConsecutiveWins,
    perLot: result.perLot.map((l) => ({
      label: l.label,
      distributed: l.distributed,
      stockTotal: l.stockTotal,
      distributionRate: l.distributionRate,
    })),
  };
};

export const runLotteryTuneSearch = (input: {
  samples: number;
  attempts: number;
  seed: number;
  lots: LotteryLotRow[];
  onProgress?: (current: number, total: number) => void;
}): LotteryTuneSearchResult => {
  const { samples, attempts, seed, lots: sourceLots, onProgress } = input;

  if (sourceLots.length === 0) {
    return {
      samples,
      attempts,
      seed,
      inventoryLines: [],
      top: [],
      recommended: null,
    };
  }

  const inventoryLines = inventoryLinesFromLots(sourceLots);
  const rng = createRng(seed);

  type Candidate = {
    score: number;
    baseWinPressure: number;
    maxBoost: number;
    weights: LotteryTuneWeights;
    result: ReturnType<typeof simulateLotteryRun>;
  };

  const candidates: Candidate[] = [];

  for (let i = 0; i < samples; i++) {
    const baseWinPressure = randRange(rng, 0.08, 0.22);
    const maxBoost = randRange(rng, 2, 5);
    const wCommon = randRange(rng, 1.2, 4);
    const wRare = randRange(rng, 0.22, 0.85);
    const wVeryRare = randRange(rng, 0.03, 0.22);
    const wMedium = randRange(
      rng,
      Math.min(wCommon, wRare) * 0.55,
      Math.max(wCommon, wRare) * 0.95,
    );

    const weightBundle: LotteryTuneWeights = {
      common: wCommon,
      medium: wMedium,
      rare: wRare,
      very_rare: wVeryRare,
    };

    const config: LotteryConfigRow = {
      id: 1,
      ...baseConfigTemplate,
      baseWinPressure,
      maxBoost,
    };

    const lots = cloneLotsWithRarityWeights(sourceLots, weightBundle);

    const result = simulateLotteryRun({
      attempts,
      profile: "normal",
      config,
      lots,
    });

    const score = scoreRun(result);
    candidates.push({
      score,
      baseWinPressure,
      maxBoost,
      weights: weightBundle,
      result,
    });

    onProgress?.(i + 1, samples);
  }

  candidates.sort((a, b) => b.score - a.score);

  const topRaw = candidates.slice(0, 20);
  const top: LotteryTuneCandidateSummary[] = topRaw.map((c, idx) =>
    summarizeCandidate(
      idx + 1,
      c.score,
      c.baseWinPressure,
      c.maxBoost,
      c.weights,
      c.result,
    ),
  );

  const best = topRaw[0];
  const recommended: LotteryTuneRecommended | null = best
    ? {
        baseWinPressure: Number(best.baseWinPressure.toFixed(4)),
        maxBoost: Number(best.maxBoost.toFixed(2)),
        lots: toRecommended(best.weights, sourceLots),
      }
    : null;

  return {
    samples,
    attempts,
    seed,
    inventoryLines,
    top,
    recommended,
  };
};
