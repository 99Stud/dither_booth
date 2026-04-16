import type { LotteryConfigRow, LotteryEventRow, LotteryLotRow } from "./lottery.types";

import {
  LOTTERY_OUTCOME,
  type LotterySimulationProfile,
} from "./lottery.constants";
import { executeDraw } from "./lottery.engine";

type HourlyBucket = {
  hour: string;
  attempts: number;
  wins: number;
  losses: number;
  forcedLosses: number;
  winRate: number;
};

type MinuteBucket = {
  /** Minutes since midnight; stable ordering key. */
  sortKey: number;
  /** Clock label within the window, e.g. `16:05`. */
  minute: string;
  attempts: number;
  wins: number;
  losses: number;
  forcedLosses: number;
  winRate: number;
};

const formatMinuteLabel = (sortKey: number): string => {
  const h = Math.floor(sortKey / 60);
  const m = sortKey % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

type LotDistribution = {
  id: number;
  label: string;
  rarity: string;
  stockTotal: number;
  stockRemaining: number;
  distributed: number;
  distributionRate: number;
};

export type ProbSample = {
  /** Elapsed window % at this sample point (0–100). */
  elapsedPct: number;
  /** Win probability computed by the engine (0–100 %). */
  pPct: number;
  /** Stock remaining as % of initial total (0–100 %). */
  stockPct: number;
};

export type LotterySimulationResult = {
  profile: LotterySimulationProfile;
  attempts: number;
  wins: number;
  losses: number;
  forcedLosses: number;
  /** Draws that were not blocked by anti-abuse rules. */
  eligibleAttempts: number;
  /** wins / eligibleAttempts — the "real" win rate ignoring spam blocks. */
  effectiveWinRate: number;
  /** Average P(win) across eligible draws (0–1). */
  avgWinProbability: number;
  /** Highest P(win) observed during the run (0–1). */
  peakWinProbability: number;
  totalInitialStock: number;
  totalRemainingStock: number;
  totalDistributedStock: number;
  winRate: number;
  forcedLossRate: number;
  /** Down-sampled time-series for the probability & stock depletion chart. */
  probCurve: ProbSample[];
  hourly: HourlyBucket[];
  /** One row per clock minute that received at least one attempt. */
  byMinute: MinuteBucket[];
  perLot: LotDistribution[];
  invariants: {
    stockNeverNegative: boolean;
    allLotsDistributed: boolean;
    forcedLossesPresent: boolean;
  };
};

const buildAttemptTime = (
  attemptIndex: number,
  attempts: number,
  profile: LotterySimulationProfile,
  previousTimestamp?: string,
): Date => {
  const windowStart = new Date(2026, 3, 15, 16, 0, 0, 0).getTime();
  const windowEnd = new Date(2026, 3, 15, 21, 0, 0, 0).getTime();
  const windowMs = windowEnd - windowStart;
  const baseIntervalMs = windowMs / Math.max(1, attempts);
  const scheduledTimeMs = windowStart + baseIntervalMs * attemptIndex;
  const now = new Date(scheduledTimeMs);

  let isBurst = false;
  const progress = attemptIndex / attempts;
  if (profile === "bursty") {
    isBurst = true;
  } else if (profile === "mixed") {
    isBurst = progress > 0.4 && progress < 0.5;
  }

  if (isBurst && previousTimestamp) {
    const previousTime = new Date(previousTimestamp);
    now.setTime(previousTime.getTime() + 3_000);
  }

  return now;
};

/** Cap the probability curve at 200 samples regardless of attempt count. */
const MAX_PROB_SAMPLES = 200;

export const simulateLotteryRun = ({
  attempts,
  profile,
  config,
  lots,
}: {
  attempts: number;
  profile: LotterySimulationProfile;
  config: LotteryConfigRow;
  lots: LotteryLotRow[];
}): LotterySimulationResult => {
  const workingLots = lots.map((lot) => ({ ...lot }));
  const events: LotteryEventRow[] = [];
  const hourlyBuckets = new Map<
    number,
    { attempts: number; wins: number; losses: number; forcedLosses: number }
  >();
  const minuteBuckets = new Map<
    number,
    { attempts: number; wins: number; losses: number; forcedLosses: number }
  >();

  let wins = 0;
  let losses = 0;
  let forcedLosses = 0;
  let eligibleAttempts = 0;
  let sumWinProbability = 0;
  let eligibleProbCount = 0;
  let peakWinProbability = 0;

  const totalInitialStock = workingLots.reduce((s, l) => s + l.stockTotal, 0);

  const sampleEvery = Math.max(1, Math.floor(attempts / MAX_PROB_SAMPLES));
  const probCurve: ProbSample[] = [];

  for (let i = 0; i < attempts; i++) {
    const now = buildAttemptTime(
      i,
      attempts,
      profile,
      events[events.length - 1]?.timestamp,
    );

    const result = executeDraw({
      now,
      config,
      lots: workingLots,
      recentEvents: events,
    });

    if (result.outcome === LOTTERY_OUTCOME.WIN && result.lotId !== null) {
      const lot = workingLots.find((candidate) => candidate.id === result.lotId);
      if (lot && lot.stockRemaining > 0) {
        lot.stockRemaining -= 1;
      }
    }

    events.push({
      id: i + 1,
      sessionId: null,
      timestamp: now.toISOString(),
      outcome: result.outcome,
      lotId: result.lotId,
      abuseDetected: result.abuseDetected,
      computedPressure: result.computedPressure,
      computedWinProbability: result.computedWinProbability,
      remainingStock: result.remainingStock,
      elapsedWindowRatio: result.elapsedWindowRatio,
      captureToDrawMs: null,
    });

    if (result.outcome === LOTTERY_OUTCOME.WIN) {
      wins += 1;
    } else if (result.outcome === LOTTERY_OUTCOME.FORCED_LOSS) {
      forcedLosses += 1;
    } else {
      losses += 1;
    }

    // Track eligible draws (not blocked by anti-abuse) and their probabilities.
    if (result.outcome !== LOTTERY_OUTCOME.FORCED_LOSS) {
      eligibleAttempts += 1;
      if (result.computedWinProbability > 0) {
        sumWinProbability += result.computedWinProbability;
        eligibleProbCount += 1;
        if (result.computedWinProbability > peakWinProbability) {
          peakWinProbability = result.computedWinProbability;
        }
      }
    }

    // Down-sample for the probability & stock curve chart.
    if (i % sampleEvery === 0) {
      const currentStock = workingLots.reduce((s, l) => s + l.stockRemaining, 0);
      probCurve.push({
        elapsedPct: Math.round(result.elapsedWindowRatio * 100),
        pPct: Math.round(result.computedWinProbability * 1000) / 10,
        stockPct:
          totalInitialStock > 0
            ? Math.round((currentStock / totalInitialStock) * 1000) / 10
            : 0,
      });
    }

    const hourKey = now.getHours();
    const bucket = hourlyBuckets.get(hourKey) ?? {
      attempts: 0,
      wins: 0,
      losses: 0,
      forcedLosses: 0,
    };
    bucket.attempts += 1;
    if (result.outcome === LOTTERY_OUTCOME.WIN) {
      bucket.wins += 1;
    } else if (result.outcome === LOTTERY_OUTCOME.FORCED_LOSS) {
      bucket.forcedLosses += 1;
    } else {
      bucket.losses += 1;
    }
    hourlyBuckets.set(hourKey, bucket);

    const minuteKey = now.getHours() * 60 + now.getMinutes();
    const minuteBucket = minuteBuckets.get(minuteKey) ?? {
      attempts: 0,
      wins: 0,
      losses: 0,
      forcedLosses: 0,
    };
    minuteBucket.attempts += 1;
    if (result.outcome === LOTTERY_OUTCOME.WIN) {
      minuteBucket.wins += 1;
    } else if (result.outcome === LOTTERY_OUTCOME.FORCED_LOSS) {
      minuteBucket.forcedLosses += 1;
    } else {
      minuteBucket.losses += 1;
    }
    minuteBuckets.set(minuteKey, minuteBucket);
  }

  const totalRemainingStock = workingLots.reduce((s, l) => s + l.stockRemaining, 0);
  const totalDistributedStock = totalInitialStock - totalRemainingStock;

  const hourly = Array.from(hourlyBuckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hour, bucket]) => ({
      hour: `${String(hour).padStart(2, "0")}h`,
      attempts: bucket.attempts,
      wins: bucket.wins,
      losses: bucket.losses,
      forcedLosses: bucket.forcedLosses,
      winRate: bucket.attempts > 0 ? bucket.wins / bucket.attempts : 0,
    }));

  const byMinute = Array.from(minuteBuckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([sortKey, bucket]) => ({
      sortKey,
      minute: formatMinuteLabel(sortKey),
      attempts: bucket.attempts,
      wins: bucket.wins,
      losses: bucket.losses,
      forcedLosses: bucket.forcedLosses,
      winRate: bucket.attempts > 0 ? bucket.wins / bucket.attempts : 0,
    }));

  const perLot = workingLots.map((lot) => {
    const distributed = lot.stockTotal - lot.stockRemaining;
    return {
      id: lot.id,
      label: lot.label,
      rarity: lot.rarity,
      stockTotal: lot.stockTotal,
      stockRemaining: lot.stockRemaining,
      distributed,
      distributionRate: lot.stockTotal > 0 ? distributed / lot.stockTotal : 0,
    };
  });

  return {
    profile,
    attempts,
    wins,
    losses,
    forcedLosses,
    eligibleAttempts,
    effectiveWinRate: eligibleAttempts > 0 ? wins / eligibleAttempts : 0,
    avgWinProbability: eligibleProbCount > 0 ? sumWinProbability / eligibleProbCount : 0,
    peakWinProbability,
    totalInitialStock,
    totalRemainingStock,
    totalDistributedStock,
    winRate: attempts > 0 ? wins / attempts : 0,
    forcedLossRate: attempts > 0 ? forcedLosses / attempts : 0,
    probCurve,
    hourly,
    byMinute,
    perLot,
    invariants: {
      stockNeverNegative: workingLots.every((lot) => lot.stockRemaining >= 0),
      allLotsDistributed: totalRemainingStock === 0,
      forcedLossesPresent:
        profile === "bursty" || profile === "mixed" ? forcedLosses > 0 : false,
    },
  };
};
