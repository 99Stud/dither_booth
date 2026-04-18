/**
 * Large Monte Carlo audit of the lottery engine (no DB).
 * Run: bun scripts/lottery-monte-audit-sim.ts
 */
import { LOTTERY_OUTCOME } from "#domains/lottery/internal/lottery.constants.ts";
import { executeDraw } from "#domains/lottery/internal/lottery.engine.ts";
import { runMonteCarloLotterySimulation } from "#domains/lottery/internal/lottery.monte-carlo.ts";
import type { LotteryConfigRow, LotteryLotRow } from "#domains/lottery/internal/lottery.types.ts";

const baseLotTemplate = (): LotteryLotRow[] => [
  {
    id: 1,
    label: "Common A",
    stockTotal: 25,
    stockRemaining: 25,
    baseWeight: 2.2,
    rarity: "common",
    description: null,
    instructions: null,
    active: true,
    sortOrder: 0,
  },
  {
    id: 2,
    label: "Medium B",
    stockTotal: 20,
    stockRemaining: 20,
    baseWeight: 1.5,
    rarity: "medium",
    description: null,
    instructions: null,
    active: true,
    sortOrder: 1,
  },
  {
    id: 3,
    label: "Rare C",
    stockTotal: 10,
    stockRemaining: 10,
    baseWeight: 0.78,
    rarity: "rare",
    description: null,
    instructions: null,
    active: true,
    sortOrder: 2,
  },
  {
    id: 4,
    label: "Very rare D",
    stockTotal: 2,
    stockRemaining: 2,
    baseWeight: 0.21,
    rarity: "very_rare",
    description: null,
    instructions: null,
    active: true,
    sortOrder: 3,
  },
];

const cloneLots = (lots: LotteryLotRow[]): LotteryLotRow[] =>
  lots.map((l) => ({ ...l }));

const configRow = (
  baseWinPressure: number,
  maxBoost: number,
): LotteryConfigRow => ({
  id: 1,
  enabled: true,
  startTime: "16:00",
  endTime: "21:00",
  baseWinPressure,
  maxBoost,
  abuseWindowSeconds: 60,
  abuseMaxAttempts: 5,
  abuseMinIntervalSeconds: 10,
  abuseCooldownSeconds: 120,
});

type Scenario = { name: string; config: LotteryConfigRow };

const scenarios: Scenario[] = [
  { name: "defaults (base 0.15, maxBoost 3)", config: configRow(0.15, 3) },
  { name: "moderate (0.18, maxBoost 4)", config: configRow(0.18, 4) },
  {
    name: "aggressive tune-like (0.2047, maxBoost 5.69)",
    config: configRow(0.2047, 5.69),
  },
];

const profiles = ["normal", "bursty", "mixed"] as const;

/** Random timestamps uniformly in [windowStart, windowEnd), sorted. */
const sparseRandomRun = (
  config: LotteryConfigRow,
  sourceLots: LotteryLotRow[],
  attemptCount: number,
  windowStart: Date,
  windowEndMs: number,
): {
  wins: number;
  losses: number;
  forced: number;
  peakP: number;
  pGe099Eligible: number;
  eligible: number;
  maxWinStreak: number;
} => {
  const lots = cloneLots(sourceLots);
  const events: import("#domains/lottery/internal/lottery.types.ts").LotteryEventRow[] =
    [];
  const span = windowEndMs - windowStart.getTime();
  const times: number[] = [];
  for (let i = 0; i < attemptCount; i++) {
    times.push(windowStart.getTime() + Math.random() * span);
  }
  times.sort((a, b) => a - b);

  let wins = 0;
  let losses = 0;
  let forced = 0;
  let peakP = 0;
  let pGe099 = 0;
  let eligible = 0;
  let streak = 0;
  let maxWinStreak = 0;

  for (const t of times) {
    const now = new Date(t);
    const r = executeDraw({ now, config, lots, recentEvents: events });

    if (r.outcome === LOTTERY_OUTCOME.WIN && r.lotId !== null) {
      const lot = lots.find((c) => c.id === r.lotId);
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
      maxWinStreak = Math.max(maxWinStreak, streak);
    } else {
      streak = 0;
      if (r.outcome === LOTTERY_OUTCOME.FORCED_LOSS) forced++;
      else losses++;
    }

    if (r.outcome !== LOTTERY_OUTCOME.FORCED_LOSS) {
      eligible++;
      const p = r.computedWinProbability;
      if (p > peakP) peakP = p;
      if (p >= 0.99) pGe099++;
    }
  }

  return {
    wins,
    losses,
    forced,
    peakP,
    pGe099Eligible: eligible > 0 ? pGe099 / eligible : 0,
    eligible,
    maxWinStreak,
  };
};

const windowStart = new Date(2026, 3, 15, 16, 0, 0, 0);
const windowEndMs = new Date(2026, 3, 15, 21, 0, 0, 0).getTime();

const fmt = (n: number, d = 4) => n.toFixed(d);
const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;

console.log("=== Lottery Monte Carlo audit (engine only, no SQLite) ===\n");

const MC_SAMPLES = 600;
const MC_ATTEMPTS = 500;

for (const { name, config } of scenarios) {
  console.log(`\n--- Scenario: ${name} ---`);
  const lots = baseLotTemplate();
  const totalStock = lots.reduce((s, l) => s + l.stockTotal, 0);

  for (const profile of profiles) {
    const mc = runMonteCarloLotterySimulation({
      attempts: MC_ATTEMPTS,
      samples: MC_SAMPLES,
      profile,
      config: { ...config },
      lots: cloneLots(lots),
    });

    const ew = mc.effectiveWinRate;
    const pk = mc.peakWinProbability;
    const mx = mc.maxConsecutiveWins;
    const sat = mc.saturatedShare;
    const rem = mc.totalRemainingStock;
    console.log(
      `  profile=${profile.padEnd(7)}  attempts/run=${MC_ATTEMPTS}  monte_samples=${MC_SAMPLES}  total_stock=${totalStock}`,
    );
    console.log(
    `    effectiveWinRate: mean=${fmt(ew.mean, 3)}  p10=${fmt(ew.p10, 3)}  p50=${fmt(ew.p50, 3)}  p90=${fmt(ew.p90, 3)}`,
    );
    console.log(
    `    peakWinProb:      mean=${fmt(pk.mean, 3)}  p90=${fmt(pk.p90, 3)}  max=${fmt(pk.max, 3)}`,
    );
    console.log(
    `    maxWinStreak:     mean=${fmt(mx.mean, 2)}  p90=${fmt(mx.p90, 2)}  max=${fmt(mx.max, 0)}`,
    );
    console.log(
    `    saturatedShare:   mean=${fmtPct(sat.mean)}  p90=${fmtPct(sat.p90)}`,
    );
    console.log(
    `    remainingStock:   mean=${fmt(rem.mean, 1)}  p90=${fmt(rem.p90, 1)}  max=${fmt(rem.max, 0)}`,
    );
    console.log(
    `    fullDepletion:   ${fmtPct(mc.fullDepletionRate)}  abuseTriggered: ${fmtPct(mc.abuseTriggeredRate)}`,
    );
  }

  const SPARSE_RUNS = 8000;
  const SPARSE_ATTEMPTS = 80;
  let sumW = 0;
  let sumL = 0;
  let sumF = 0;
  let sumPeak = 0;
  let sumPGe099 = 0;
  let sumMaxStreak = 0;
  for (let i = 0; i < SPARSE_RUNS; i++) {
    const s = sparseRandomRun(config, lots, SPARSE_ATTEMPTS, windowStart, windowEndMs);
    sumW += s.wins;
    sumL += s.losses;
    sumF += s.forced;
    sumPeak += s.peakP;
    sumPGe099 += s.pGe099Eligible;
    sumMaxStreak += s.maxWinStreak;
  }
  console.log(
    `  sparse-random (${SPARSE_RUNS} runs × ${SPARSE_ATTEMPTS} attempts, uniform times in window):`,
  );
  console.log(
    `    win / loss / forced (totals): ${sumW} / ${sumL} / ${sumF}  → win rate ${fmtPct(sumW / (sumW + sumL + sumF))}`,
  );
  console.log(
    `    mean peak P(win) per run:     ${fmt(sumPeak / SPARSE_RUNS, 3)}`,
  );
  console.log(
    `    mean fraction of eligible draws with P≥0.99: ${fmt(sumPGe099 / SPARSE_RUNS, 3)}`,
  );
  console.log(
    `    mean max win streak per run: ${(sumMaxStreak / SPARSE_RUNS).toFixed(2)}`,
  );
}

console.log("\n=== Done ===\n");
