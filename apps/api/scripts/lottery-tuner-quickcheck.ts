/**
 * Quick check: run the tuner on a synthetic pool and print the top recommendations.
 * Goal: new scorer should prefer balanced configs (no saturation, short streaks)
 * over the old "maximum base*maxBoost" regime.
 */
import { runLotteryTuneSearch } from "#domains/lottery/internal/lottery.tuning.ts";
import type { LotteryLotRow } from "#domains/lottery/internal/lottery.types.ts";

const lots: LotteryLotRow[] = [
  { id: 1, label: "Common A",    stockTotal: 25, stockRemaining: 25, baseWeight: 2.2,  rarity: "common",    description: null, instructions: null, active: true, sortOrder: 0 },
  { id: 2, label: "Medium B",    stockTotal: 20, stockRemaining: 20, baseWeight: 1.5,  rarity: "medium",    description: null, instructions: null, active: true, sortOrder: 1 },
  { id: 3, label: "Rare C",      stockTotal: 10, stockRemaining: 10, baseWeight: 0.78, rarity: "rare",      description: null, instructions: null, active: true, sortOrder: 2 },
  { id: 4, label: "Very rare D", stockTotal: 2,  stockRemaining: 2,  baseWeight: 0.21, rarity: "very_rare", description: null, instructions: null, active: true, sortOrder: 3 },
];

const result = runLotteryTuneSearch({
  samples: 800,
  attempts: 500,
  seed: 42,
  lots,
});

console.log("Top 5 tuner candidates:");
console.log("rank  score        base    maxBoost  wins  forced  jitter    remaining");
for (const c of result.top.slice(0, 5)) {
  console.log(
    `  ${String(c.rank).padStart(2)}   ` +
    `${c.score.toFixed(0).padStart(10)}  ` +
    `${c.baseWinPressure.toFixed(4)}  ` +
    `${c.maxBoost.toFixed(2).padStart(7)}  ` +
    `${String(c.wins).padStart(4)}  ` +
    `${String(c.forcedLosses).padStart(6)}  ` +
    `${c.hourlyWinRateStd.toFixed(4)}    ` +
    `${String(c.totalRemainingStock).padStart(3)}`,
  );
}

if (result.recommended) {
  console.log("\nRecommended:");
  console.log(`  base=${result.recommended.baseWinPressure}  maxBoost=${result.recommended.maxBoost}`);
  console.log(`  base * maxBoost = ${(result.recommended.baseWinPressure * result.recommended.maxBoost).toFixed(3)} (soft ceiling cap: 0.75)`);
}
