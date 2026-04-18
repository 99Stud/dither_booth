/**
 * Lottery simulation script.
 *
 * Runs many synthetic draws against the shared simulation engine.
 *
 * Usage:
 *   bun apps/api/src/domains/lottery/scripts/simulate-lottery.ts [--attempts N] [--profile normal|bursty|mixed]
 */

import { simulateLotteryRun } from "../internal/lottery.simulation";
import type { LotteryConfigRow, LotteryLotRow } from "../internal/lottery.types";

interface SimConfig {
  attempts: number;
  profile: "normal" | "bursty" | "mixed";
}

const parseArgs = (): SimConfig => {
  const args = process.argv.slice(2);
  let attempts = 300;
  let profile: SimConfig["profile"] = "normal";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--attempts" && args[i + 1]) {
      attempts = Number.parseInt(args[i + 1]!, 10);
      i++;
    }
    if (args[i] === "--profile" && args[i + 1]) {
      profile = args[i + 1] as SimConfig["profile"];
      i++;
    }
  }

  return { attempts, profile };
};

const defaultConfig: LotteryConfigRow = {
  id: 1,
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

const defaultLots: LotteryLotRow[] = [
  {
    id: 1,
    label: "Shots",
    stockTotal: 10,
    stockRemaining: 10,
    baseWeight: 0.5,
    rarity: "rare",
    description: null,
    instructions: null,
    active: true,
    sortOrder: 0,
  },
  {
    id: 2,
    label: "Stickers bleus",
    stockTotal: 15,
    stockRemaining: 15,
    baseWeight: 3,
    rarity: "common",
    description: null,
    instructions: null,
    active: true,
    sortOrder: 1,
  },
  {
    id: 3,
    label: "Stickers rouges",
    stockTotal: 9,
    stockRemaining: 9,
    baseWeight: 0.5,
    rarity: "rare",
    description: null,
    instructions: null,
    active: true,
    sortOrder: 2,
  },
  {
    id: 4,
    label: "Affiche #1",
    stockTotal: 5,
    stockRemaining: 5,
    baseWeight: 2,
    rarity: "common",
    description: null,
    instructions: null,
    active: true,
    sortOrder: 3,
  },
  {
    id: 5,
    label: "Affiche #2",
    stockTotal: 5,
    stockRemaining: 5,
    baseWeight: 2,
    rarity: "common",
    description: null,
    instructions: null,
    active: true,
    sortOrder: 4,
  },
  {
    id: 6,
    label: "Affiche #3",
    stockTotal: 5,
    stockRemaining: 5,
    baseWeight: 1,
    rarity: "medium",
    description: null,
    instructions: null,
    active: true,
    sortOrder: 5,
  },
  {
    id: 7,
    label: "Affiche #4",
    stockTotal: 5,
    stockRemaining: 5,
    baseWeight: 0.5,
    rarity: "rare",
    description: null,
    instructions: null,
    active: true,
    sortOrder: 6,
  },
  {
    id: 8,
    label: "Pack tartineur",
    stockTotal: 1,
    stockRemaining: 1,
    baseWeight: 0.1,
    rarity: "very_rare",
    description: null,
    instructions: null,
    active: true,
    sortOrder: 7,
  },
];

const run = () => {
  const simConfig = parseArgs();
  const result = simulateLotteryRun({
    attempts: simConfig.attempts,
    profile: simConfig.profile,
    config: { ...defaultConfig },
    lots: defaultLots.map((lot) => ({ ...lot })),
  });

  // Print summary
  console.log("\n=== LOTTERY SIMULATION RESULTS ===");
  console.log(`Profile: ${result.profile}`);
  console.log(`Attempts: ${result.attempts}`);
  console.log(`Wins: ${result.wins} (${(result.winRate * 100).toFixed(1)}%)`);
  console.log(`Losses: ${result.losses}`);
  console.log(`Forced losses: ${result.forcedLosses}`);
  console.log("");

  console.log("--- Per-lot distribution ---");
  for (const lot of result.perLot) {
    const pct = (lot.distributionRate * 100).toFixed(0);
    console.log(
      `  ${lot.label.padEnd(20)} ${lot.distributed}/${lot.stockTotal} distributed (${pct}%) | remaining: ${lot.stockRemaining}`,
    );
  }
  console.log(
    `  ${"TOTAL".padEnd(20)} ${result.totalDistributedStock}/${result.totalInitialStock} distributed | remaining: ${result.totalRemainingStock}`,
  );

  console.log("");
  console.log("--- Hourly breakdown ---");
  for (const bucket of result.hourly) {
    const winRate = (bucket.winRate * 100).toFixed(1);
    console.log(
      `  ${bucket.hour}: ${bucket.attempts} attempts | ${bucket.wins} wins (${winRate}%) | ${bucket.losses} losses | ${bucket.forcedLosses} forced`,
    );
  }

  // Validate invariants
  console.log("");
  console.log("--- Invariant checks ---");
  console.log(
    `  Stock never negative: ${result.invariants.stockNeverNegative ? "PASS ✓" : "FAIL ❌"}`,
  );
  console.log(
    `  All lots distributed: ${result.invariants.allLotsDistributed ? "PASS ✓" : `PARTIAL (${result.totalRemainingStock} remaining)`}`,
  );

  if (result.profile === "bursty" || result.profile === "mixed") {
    console.log(
      `  Forced losses present: ${result.invariants.forcedLossesPresent ? "PASS ✓" : "FAIL ❌"}`,
    );
  }

  console.log("");
};

run();
