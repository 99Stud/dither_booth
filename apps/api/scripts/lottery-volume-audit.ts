/**
 * Volume-sensitivity audit. Sweep a range of "attempts per day" against the
 * current engine + a fixed config, both for evenly-spaced and sparse-random
 * traffic. Goal: see how depletion / peak-P / streaks / forced-loss rate
 * shift when real foot traffic is unknown.
 *
 * Run: bun apps/api/scripts/lottery-volume-audit.ts
 */
import { LOTTERY_OUTCOME } from "#domains/lottery/internal/lottery.constants.ts";
import { executeDraw } from "#domains/lottery/internal/lottery.engine.ts";
import type {
  LotteryConfigRow,
  LotteryEventRow,
  LotteryLotRow,
} from "#domains/lottery/internal/lottery.types.ts";

const lots = (): LotteryLotRow[] => [
  { id: 1, label: "Common A", stockTotal: 25, stockRemaining: 25, baseWeight: 2.2, rarity: "common", description: null, instructions: null, active: true, sortOrder: 0 },
  { id: 2, label: "Medium B", stockTotal: 20, stockRemaining: 20, baseWeight: 1.5, rarity: "medium", description: null, instructions: null, active: true, sortOrder: 1 },
  { id: 3, label: "Rare C", stockTotal: 10, stockRemaining: 10, baseWeight: 0.78, rarity: "rare", description: null, instructions: null, active: true, sortOrder: 2 },
  { id: 4, label: "Very rare D", stockTotal: 2, stockRemaining: 2, baseWeight: 0.21, rarity: "very_rare", description: null, instructions: null, active: true, sortOrder: 3 },
];

const config: LotteryConfigRow = {
  id: 1,
  enabled: true,
  startTime: "16:00",
  endTime: "21:00",
  baseWinPressure: 0.15,
  maxBoost: 3,
  abuseWindowSeconds: 60,
  abuseMaxAttempts: 20,
  abuseMinIntervalSeconds: 4,
  abuseCooldownSeconds: 60,
};

const TOTAL_STOCK = lots().reduce((s, l) => s + l.stockTotal, 0);
const windowStart = new Date(2026, 3, 15, 16, 0, 0, 0).getTime();
const windowEnd = new Date(2026, 3, 15, 21, 0, 0, 0).getTime();
const span = windowEnd - windowStart;

type RunStats = {
  wins: number;
  losses: number;
  forced: number;
  remaining: number;
  peakP: number;
  satShare: number;
  maxStreak: number;
  depletedAtRatio: number | null;
};

const runOnce = (
  attempts: number,
  spacing: "even" | "random" | "poisson-burst",
): RunStats => {
  const pool = lots().map((l) => ({ ...l }));
  const events: LotteryEventRow[] = [];

  let times: number[];
  if (spacing === "even") {
    times = Array.from({ length: attempts }, (_, i) =>
      windowStart + ((i + 0.5) / attempts) * span,
    );
  } else if (spacing === "random") {
    times = Array.from({ length: attempts }, () => windowStart + Math.random() * span);
    times.sort((a, b) => a - b);
  } else {
    times = [];
    let t = windowStart;
    const meanGap = span / attempts;
    while (times.length < attempts && t < windowEnd) {
      const u = Math.max(1e-6, Math.random());
      const gap = -Math.log(u) * meanGap;
      t += gap;
      if (t < windowEnd) times.push(t);
    }
    while (times.length < attempts) times.push(windowEnd - 1);
  }

  let wins = 0;
  let losses = 0;
  let forced = 0;
  let peakP = 0;
  let satCount = 0;
  let eligible = 0;
  let streak = 0;
  let maxStreak = 0;
  let depletedAtRatio: number | null = null;

  for (const t of times) {
    const now = new Date(t);
    const r = executeDraw({ now, config, lots: pool, recentEvents: events });

    if (r.outcome === LOTTERY_OUTCOME.WIN && r.lotId !== null) {
      const lot = pool.find((c) => c.id === r.lotId);
      if (lot && lot.stockRemaining > 0) lot.stockRemaining -= 1;
    }
    events.push({
      id: events.length + 1,
      timestamp: now.toISOString(),
      outcome: r.outcome,
      lotId: r.lotId,
      abuseDetected: r.abuseDetected,
      computedPressure: r.computedPressure,
      computedWinProbability: r.computedWinProbability,
      remainingStock: r.remainingStock,
      elapsedWindowRatio: r.elapsedWindowRatio,
      captureToDrawMs: null,
    });

    if (r.outcome === LOTTERY_OUTCOME.WIN) {
      wins++;
      streak++;
      if (streak > maxStreak) maxStreak = streak;
    } else if (r.outcome === LOTTERY_OUTCOME.FORCED_LOSS) {
      forced++;
      streak = 0;
    } else {
      losses++;
      streak = 0;
    }
    if (r.outcome !== LOTTERY_OUTCOME.FORCED_LOSS) {
      eligible++;
      const p = r.computedWinProbability;
      if (p > peakP) peakP = p;
      if (p >= 0.99) satCount++;
    }

    const remain = pool.reduce((s, l) => s + l.stockRemaining, 0);
    if (remain === 0 && depletedAtRatio === null) {
      depletedAtRatio = r.elapsedWindowRatio;
    }
  }

  return {
    wins,
    losses,
    forced,
    remaining: pool.reduce((s, l) => s + l.stockRemaining, 0),
    peakP,
    satShare: eligible > 0 ? satCount / eligible : 0,
    maxStreak,
    depletedAtRatio,
  };
};

const RUNS = 200;
const VOLUMES = [20, 40, 80, 150, 300, 600, 1200];
const SPACINGS: Array<"even" | "random" | "poisson-burst"> = [
  "even",
  "random",
  "poisson-burst",
];

const fmt = (n: number, d = 2) => n.toFixed(d);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

console.log(
  `Volume audit. Engine config: base=${config.baseWinPressure}, maxBoost=${config.maxBoost}, total stock=${TOTAL_STOCK}.`,
);
console.log(
  `${RUNS} runs per cell. Window 16:00-21:00 (5 h).\n`,
);

for (const spacing of SPACINGS) {
  console.log(`--- spacing=${spacing} ---`);
  console.log(
    "  attempts  depleted%  meanRem  meanWinRate  meanPeakP  meanSat≥99%  meanMaxStreak  meanForced/run  meanDepletedAt%",
  );
  for (const attempts of VOLUMES) {
    let depleted = 0;
    let sumRem = 0;
    let sumWins = 0;
    let sumLosses = 0;
    let sumForced = 0;
    let sumPeak = 0;
    let sumSat = 0;
    let sumStreak = 0;
    let sumDepRatio = 0;
    let depRatioCount = 0;
    for (let i = 0; i < RUNS; i++) {
      const s = runOnce(attempts, spacing);
      if (s.remaining === 0) depleted++;
      sumRem += s.remaining;
      sumWins += s.wins;
      sumLosses += s.losses;
      sumForced += s.forced;
      sumPeak += s.peakP;
      sumSat += s.satShare;
      sumStreak += s.maxStreak;
      if (s.depletedAtRatio !== null) {
        sumDepRatio += s.depletedAtRatio;
        depRatioCount++;
      }
    }
    const winRate = sumWins / (sumWins + sumLosses + sumForced);
    console.log(
      `  ${String(attempts).padStart(8)}  ` +
      `${pct(depleted / RUNS).padStart(8)}  ` +
      `${fmt(sumRem / RUNS, 1).padStart(7)}  ` +
      `${pct(winRate).padStart(11)}  ` +
      `${fmt(sumPeak / RUNS, 3).padStart(9)}  ` +
      `${pct(sumSat / RUNS).padStart(11)}  ` +
      `${fmt(sumStreak / RUNS, 2).padStart(13)}  ` +
      `${fmt(sumForced / RUNS, 2).padStart(14)}  ` +
      `${depRatioCount > 0 ? pct(sumDepRatio / depRatioCount).padStart(15) : "—".padStart(15)}`,
    );
  }
  console.log("");
}
