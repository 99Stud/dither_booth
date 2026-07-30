import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { eq, sql } from "drizzle-orm";

import { db, sqlite } from "#db/index";
import {
  campaignTable,
  drawTable,
  lotteryTable,
  prizeTable,
} from "#db/internal/db.schema";

import { API_DB_MIGRATE_LOG_SOURCE } from "./db.constants";

export const DEV_LOTTERY_ID = "dev_lottery";
export const DEV_CAMPAIGN_ID = "dev_campaign";

export const DEV_PRIZE_IDS = {
  common: "dev_prize_common",
  rare: "dev_prize_rare",
  legendary: "dev_prize_legendary",
} as const;

const DEFAULT_WIN_INSTRUCTION = "Présentez ce ticket au bar";

const DEV_PRIZES = [
  {
    id: DEV_PRIZE_IDS.common,
    title: "a 99stud sticker",
    winInstruction: DEFAULT_WIN_INSTRUCTION,
    weight: 40,
    totalQuantity: 100,
    remainingQuantity: 100,
    rarity: "common" as const,
  },
  {
    id: DEV_PRIZE_IDS.rare,
    title: "an El Tony Mate",
    winInstruction: DEFAULT_WIN_INSTRUCTION,
    weight: 8,
    totalQuantity: 20,
    remainingQuantity: 20,
    rarity: "rare" as const,
  },
  {
    id: DEV_PRIZE_IDS.legendary,
    title: "a free drink at the bar",
    winInstruction: DEFAULT_WIN_INSTRUCTION,
    weight: 2,
    totalQuantity: 8,
    remainingQuantity: 8,
    rarity: "legendary" as const,
  },
] as const;

export type SeedDevLotteryOptions = {
  reset?: boolean;
};

export type SeedDevLotteryResult =
  | { status: "skipped"; reason: "already_seeded" }
  | {
      status: "seeded";
      campaignId: string;
      lotteryId: string;
      prizeIds: string[];
      reset: boolean;
    };

async function clearLotteryData() {
  await db.delete(drawTable);
  await db
    .update(campaignTable)
    .set({ lotteryId: null })
    .where(sql`${campaignTable.lotteryId} is not null`);
  await db.delete(prizeTable);
  await db.delete(lotteryTable);
  await db.delete(campaignTable);
}

export async function seedDevLottery(
  options: SeedDevLotteryOptions = {},
): Promise<SeedDevLotteryResult> {
  const { reset = false } = options;

  const existing = await db.query.lotteryTable.findFirst({
    where: eq(lotteryTable.id, DEV_LOTTERY_ID),
  });

  if (existing && !reset) {
    return { status: "skipped", reason: "already_seeded" };
  }

  if (reset) {
    await clearLotteryData();
  }

  await db.insert(lotteryTable).values({
    id: DEV_LOTTERY_ID,
    enabled: true,
    noWinWeight: 50,
    winCooldownMinutes: 5,
  });

  await db.insert(prizeTable).values(
    DEV_PRIZES.map((prize) => ({
      ...prize,
      lotteryId: DEV_LOTTERY_ID,
    })),
  );

  await db.insert(campaignTable).values({
    id: DEV_CAMPAIGN_ID,
    name: "Dev event",
    lotteryId: DEV_LOTTERY_ID,
  });

  return {
    status: "seeded",
    campaignId: DEV_CAMPAIGN_ID,
    lotteryId: DEV_LOTTERY_ID,
    prizeIds: DEV_PRIZES.map((prize) => prize.id),
    reset,
  };
}

if (import.meta.main) {
  const reset = process.argv.includes("--reset");

  try {
    const result = await seedDevLottery({ reset });

    if (result.status === "skipped") {
      logKioskEvent(
        "info",
        API_DB_MIGRATE_LOG_SOURCE,
        "lottery-seed-skipped",
        {
          details: {
            reason: result.reason,
            lotteryId: DEV_LOTTERY_ID,
            hint: "Pass --reset to wipe lottery data and reseed.",
          },
        },
      );
      console.log(
        `Lottery already seeded (${DEV_LOTTERY_ID}). Pass --reset to wipe and reseed.`,
      );
    } else {
      logKioskEvent("info", API_DB_MIGRATE_LOG_SOURCE, "lottery-seeded", {
        details: {
          campaignId: result.campaignId,
          lotteryId: result.lotteryId,
          prizeIds: result.prizeIds,
          reset: result.reset,
        },
      });
      console.log(
        [
          `Seeded event ${result.campaignId} + lottery ${result.lotteryId}${result.reset ? " (reset)" : ""}.`,
          `Prizes: ${result.prizeIds.join(", ")}`,
          `Force a win with LOTTERY_FORCE_PRIZE_ID=${DEV_PRIZE_IDS.legendary}`,
        ].join("\n"),
      );
    }
  } catch (error) {
    logKioskEvent("error", API_DB_MIGRATE_LOG_SOURCE, "lottery-seed-failed", {
      error: getKioskErrorDiagnostics(error, "Lottery seed failed."),
    });
    throw error;
  } finally {
    sqlite.close();
  }
}
