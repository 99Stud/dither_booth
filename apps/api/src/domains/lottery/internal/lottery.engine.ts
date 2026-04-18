import type { LotteryConfigRow, LotteryEventRow, LotteryLotRow } from "./lottery.types";
import { LOTTERY_OUTCOME, type LotteryOutcome } from "./lottery.constants";

interface DrawContext {
  now: Date;
  config: LotteryConfigRow;
  lots: LotteryLotRow[];
  recentEvents: LotteryEventRow[];
}

interface DrawResult {
  outcome: LotteryOutcome;
  lotId: number | null;
  abuseDetected: boolean;
  computedPressure: number;
  computedWinProbability: number;
  remainingStock: number;
  elapsedWindowRatio: number;
}

const parseHHMM = (hhmm: string): { hours: number; minutes: number } => {
  const [h, m] = hhmm.split(":").map(Number);
  return { hours: h ?? 0, minutes: m ?? 0 };
};

const toMinutesOfDay = (d: Date): number => d.getHours() * 60 + d.getMinutes();

const hhmmToMinutes = (hhmm: string): number => {
  const { hours, minutes } = parseHHMM(hhmm);
  return hours * 60 + minutes;
};

export const isWithinActiveWindow = (
  now: Date,
  config: LotteryConfigRow,
): boolean => {
  const current = toMinutesOfDay(now);
  const start = hhmmToMinutes(config.startTime);
  const end = hhmmToMinutes(config.endTime);
  return current >= start && current < end;
};

export const getElapsedWindowRatio = (
  now: Date,
  config: LotteryConfigRow,
): number => {
  const current = toMinutesOfDay(now);
  const start = hhmmToMinutes(config.startTime);
  const end = hhmmToMinutes(config.endTime);
  const windowLength = end - start;
  if (windowLength <= 0) return 1;
  return Math.max(0, Math.min(1, (current - start) / windowLength));
};

/**
 * Detect abusive request rate. Only considers organic attempts that actually
 * reached the draw stage — i.e. events with `outcome != FORCED_LOSS`. This
 * prevents a feedback loop where cascade rejections themselves count toward
 * the abuse threshold and keep the kiosk locked indefinitely under sustained
 * traffic.
 */
export const detectAbuse = (
  now: Date,
  config: LotteryConfigRow,
  recentEvents: LotteryEventRow[],
): boolean => {
  const windowMs = config.abuseWindowSeconds * 1000;
  const cutoff = new Date(now.getTime() - windowMs);

  const windowEvents = recentEvents.filter(
    (e) =>
      e.outcome !== LOTTERY_OUTCOME.FORCED_LOSS &&
      new Date(e.timestamp) >= cutoff,
  );

  if (windowEvents.length >= config.abuseMaxAttempts) {
    return true;
  }

  if (windowEvents.length >= 2) {
    const sorted = windowEvents
      .map((e) => new Date(e.timestamp).getTime())
      .sort((a, b) => b - a);

    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = (sorted[i]! - sorted[i + 1]!) / 1000;
      if (gap < config.abuseMinIntervalSeconds) {
        return true;
      }
    }
  }

  return false;
};

export const isInCooldown = (
  now: Date,
  config: LotteryConfigRow,
  recentEvents: LotteryEventRow[],
): boolean => {
  const cooldownMs = config.abuseCooldownSeconds * 1000;
  const cutoff = new Date(now.getTime() - cooldownMs);

  return recentEvents.some(
    (e) => e.abuseDetected && new Date(e.timestamp) >= cutoff,
  );
};

/**
 * Hard ceiling the adaptive curve can never exceed regardless of admin config.
 * Keeps win streaks short and prevents the "every eligible draw wins" regime
 * even when `baseWinPressure * maxBoost > 1`.
 */
export const WIN_PROBABILITY_HARD_CEILING = 0.75;

/**
 * Compute the adaptive win probability from remaining stock vs elapsed time
 * in the event window (catch-up / dampening). Does not use rolling event counts.
 *
 * Catch-up uses a `tanh` saturator so P asymptotes toward a soft ceiling
 * (`min(base * maxBoost, HARD_CEILING)`) instead of crashing into 1.0.
 * This preserves "consume stock before window ends" behavior while giving
 * wins natural spacing (no deterministic win streaks).
 */
export const computeWinProbability = (
  config: LotteryConfigRow,
  elapsedRatio: number,
  totalRemainingStock: number,
  totalInitialStock: number,
): number => {
  if (totalRemainingStock <= 0 || totalInitialStock <= 0) return 0;

  const stockRemainingRatio = totalRemainingStock / totalInitialStock;
  const actualDepletionRatio = 1 - stockRemainingRatio;
  const behindRatio = elapsedRatio - actualDepletionRatio;

  const base = config.baseWinPressure;
  const softCeiling = Math.min(
    base * config.maxBoost,
    WIN_PROBABILITY_HARD_CEILING,
  );

  if (behindRatio > 0) {
    const timeUrgency = Math.max(0.1, 1 - elapsedRatio);
    const pressure = behindRatio / timeUrgency;
    const saturation = Math.tanh(pressure * 1.5);
    const probability = base + (softCeiling - base) * saturation;
    return Math.max(0, Math.min(1, probability));
  }

  if (behindRatio < 0) {
    const aheadness = -behindRatio;
    const damp = Math.max(0.3, 1 - aheadness * 2);
    return Math.max(0, Math.min(1, base * damp));
  }

  return Math.max(0, Math.min(1, base));
};

/**
 * Select a lot from the available inventory using weighted random selection.
 */
export const selectLot = (
  activeLots: LotteryLotRow[],
): LotteryLotRow | null => {
  const available = activeLots.filter(
    (lot) => lot.active && lot.stockRemaining > 0,
  );
  if (available.length === 0) return null;

  const totalWeight = available.reduce((sum, lot) => sum + lot.baseWeight, 0);
  if (totalWeight <= 0) return null;

  let random = Math.random() * totalWeight;
  for (const lot of available) {
    random -= lot.baseWeight;
    if (random <= 0) return lot;
  }

  return available[available.length - 1]!;
};

/**
 * Core draw logic: decides win/loss/forced_loss and selects a lot if winning.
 */
export const executeDraw = (ctx: DrawContext): DrawResult => {
  const { now, config, lots, recentEvents } = ctx;

  const totalRemainingStock = lots
    .filter((l) => l.active)
    .reduce((sum, l) => sum + l.stockRemaining, 0);
  const totalInitialStock = lots
    .filter((l) => l.active)
    .reduce((sum, l) => sum + l.stockTotal, 0);

  const elapsedRatio = getElapsedWindowRatio(now, config);

  const baseResult = {
    lotId: null,
    computedPressure: 0,
    computedWinProbability: 0,
    remainingStock: totalRemainingStock,
    elapsedWindowRatio: elapsedRatio,
  };

  if (!config.enabled) {
    return { ...baseResult, outcome: LOTTERY_OUTCOME.LOSS, abuseDetected: false };
  }

  if (!isWithinActiveWindow(now, config)) {
    return { ...baseResult, outcome: LOTTERY_OUTCOME.LOSS, abuseDetected: false };
  }

  if (totalRemainingStock <= 0) {
    return { ...baseResult, outcome: LOTTERY_OUTCOME.LOSS, abuseDetected: false };
  }

  const isAbuseNow = detectAbuse(now, config, recentEvents);
  const inCooldown = isInCooldown(now, config, recentEvents);

  if (isAbuseNow || inCooldown) {
    return {
      ...baseResult,
      outcome: LOTTERY_OUTCOME.FORCED_LOSS,
      abuseDetected: isAbuseNow,
    };
  }

  const winProbability = computeWinProbability(
    config,
    elapsedRatio,
    totalRemainingStock,
    totalInitialStock,
  );

  const roll = Math.random();
  const isWin = roll < winProbability;

  if (!isWin) {
    return {
      ...baseResult,
      outcome: LOTTERY_OUTCOME.LOSS,
      abuseDetected: false,
      computedWinProbability: winProbability,
    };
  }

  const selectedLot = selectLot(lots);
  if (!selectedLot) {
    return {
      ...baseResult,
      outcome: LOTTERY_OUTCOME.LOSS,
      abuseDetected: false,
      computedWinProbability: winProbability,
    };
  }

  return {
    outcome: LOTTERY_OUTCOME.WIN,
    lotId: selectedLot.id,
    abuseDetected: false,
    computedPressure: winProbability / config.baseWinPressure,
    computedWinProbability: winProbability,
    remainingStock: totalRemainingStock - 1,
    elapsedWindowRatio: elapsedRatio,
  };
};
