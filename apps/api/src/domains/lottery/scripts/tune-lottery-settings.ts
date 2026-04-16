/**
 * Random search over lottery config (CLI). Same logic as `tuneLottery` (admin).
 *
 * Usage:
 *   bun apps/api/src/domains/lottery/scripts/tune-lottery-settings.ts [--attempts N] [--samples M] [--seed S]
 */

import { db } from "#db/index.ts";
import { lotteryLotTable } from "../internal/lottery.schema.ts";
import {
  inventoryLinesFromLots,
  runLotteryTuneSearch,
} from "../internal/lottery.tuning.ts";
import { asc } from "drizzle-orm";

type TuneArgs = {
  attempts: number;
  samples: number;
  seed: number;
};

const parseArgs = (): TuneArgs => {
  const args = process.argv.slice(2);
  let attempts = 1000;
  let samples = 4000;
  let seed = 42;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--attempts" && args[i + 1]) {
      attempts = Number.parseInt(args[i + 1]!, 10);
      i++;
    }
    if (args[i] === "--samples" && args[i + 1]) {
      samples = Number.parseInt(args[i + 1]!, 10);
      i++;
    }
    if (args[i] === "--seed" && args[i + 1]) {
      seed = Number.parseInt(args[i + 1]!, 10);
      i++;
    }
  }

  return { attempts, samples, seed };
};

const renderTuneProgressLine = (current: number, total: number): string => {
  const pct =
    total <= 0 ? 100 : Math.min(100, Math.round((current / total) * 100));
  const width = 28;
  const filled =
    total <= 0 ? width : Math.min(width, Math.round((width * current) / total));
  const bar = "#".repeat(filled) + "-".repeat(Math.max(0, width - filled));
  return `[${bar}] ${pct}% (${current}/${total})`;
};

const writeTuneProgress = (current: number, total: number) => {
  const line = renderTuneProgressLine(current, total);
  if (process.stdout.isTTY) {
    process.stdout.write(`\r${line}   `);
  } else {
    const stride = Math.max(1, Math.floor(total / 40));
    if (
      current === total ||
      current === 1 ||
      (current - 1) % stride === 0
    ) {
      console.log(line);
    }
  }
};

const run = async () => {
  const { attempts, samples, seed } = parseArgs();

  const lots = await db
    .select()
    .from(lotteryLotTable)
    .orderBy(asc(lotteryLotTable.sortOrder), asc(lotteryLotTable.id))
    .all();

  if (lots.length === 0) {
    console.error("Aucun lot en base. Ajoute des lots puis relance.");
    process.exit(1);
  }

  console.log("\n=== LOTTERY SETTINGS TUNE (random search) ===");
  console.log(`attempts/run: ${attempts} | samples: ${samples} | seed: ${seed}`);
  console.log("Inventaire (lots actuels en base) :");
  for (const line of inventoryLinesFromLots(lots)) {
    console.log(`  · ${line}`);
  }
  console.log("");

  const result = runLotteryTuneSearch({
    samples,
    attempts,
    seed,
    lots,
    onProgress: (current, total) => writeTuneProgress(current, total),
  });

  if (process.stdout.isTTY) {
    process.stdout.write("\n");
  }

  console.log("--- Results ---\n");

  for (const c of result.top) {
    const r = c;
    console.log(`--- #${c.rank} score=${c.score.toFixed(0)} ---`);
    console.log(
      `  baseWinPressure=${c.baseWinPressure.toFixed(3)} maxBoost=${c.maxBoost.toFixed(2)}`,
    );
    console.log(
      `  weights: common=${c.weights.common.toFixed(3)} medium=${c.weights.medium.toFixed(3)} rare=${c.weights.rare.toFixed(3)} very_rare=${c.weights.very_rare.toFixed(3)}`,
    );
    console.log(
      `  wins=${r.wins} losses=${r.losses} forced=${r.forcedLosses} allDistributed=${r.allLotsDistributed} remainingStock=${r.totalRemainingStock}`,
    );
    console.log(`  hourly win-rate stdev≈${r.hourlyWinRateStd.toFixed(3)}`);
    if (c.rank === 1) {
      console.log("  per-lot:");
      for (const lot of r.perLot) {
        console.log(
          `    ${lot.label.padEnd(18)} ${lot.distributed}/${lot.stockTotal} (${(lot.distributionRate * 100).toFixed(0)}%)`,
        );
      }
    }
    console.log("");
  }

  if (result.recommended) {
    console.log("=== RECOMMENDED DB VALUES (top candidate) ===");
    console.log(JSON.stringify(result.recommended, null, 2));
  }
};

void run();
