import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { DEFAULT_KIT_ID } from "@dither-booth/shared/kits";
import { eq, sql } from "drizzle-orm";

import { db, sqlite } from "#db/index";
import {
  campaignTable,
  drawTable,
  lotteryTable,
  prizeTable,
  stockAdjustmentTable,
  visitTable,
} from "#db/internal/db.schema";

import { ENGINE_DB_MIGRATE_LOG_SOURCE } from "./db.constants";

export const DEV_LOTTERY_ID = "dev_lottery";
export const DEV_CAMPAIGN_ID = "dev_campaign";

export const DEV_PRIZE_IDS = {
  common: "dev_prize_common",
  rare: "dev_prize_rare",
  legendary: "dev_prize_legendary",
} as const;

const DEFAULT_WIN_INSTRUCTION = "Show this ticket at the bar";

const DEV_PRIZES = [
  {
    id: DEV_PRIZE_IDS.common,
    title: "a 99stud sticker",
    winInstruction: DEFAULT_WIN_INSTRUCTION,
    weight: 40,
    quantity: 100,
    rarity: "common" as const,
  },
  {
    id: DEV_PRIZE_IDS.rare,
    title: "an El Tony Mate",
    winInstruction: DEFAULT_WIN_INSTRUCTION,
    weight: 8,
    quantity: 20,
    rarity: "rare" as const,
  },
  {
    id: DEV_PRIZE_IDS.legendary,
    title: "a free drink at the bar",
    winInstruction: DEFAULT_WIN_INSTRUCTION,
    weight: 2,
    quantity: 8,
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
  // Visits point at draws and campaigns, so they go first.
  await db.delete(visitTable);
  await db.delete(drawTable);
  await db.delete(stockAdjustmentTable);
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
    where: { id: DEV_LOTTERY_ID },
  });

  if (existing && !reset) {
    return { status: "skipped", reason: "already_seeded" };
  }

  if (reset) {
    await clearLotteryData();
  } else {
    // One event is active at a time: the dev event replaces whatever an admin
    // set up, which stays on record as archived.
    await db
      .update(campaignTable)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(campaignTable.status, "active"));
  }

  await db.insert(lotteryTable).values({
    id: DEV_LOTTERY_ID,
    enabled: true,
    noWinWeight: 50,
    winCooldownMinutes: 5,
  });

  await db.insert(prizeTable).values(
    DEV_PRIZES.map(({ quantity: _quantity, ...prize }) => ({
      ...prize,
      lotteryId: DEV_LOTTERY_ID,
    })),
  );

  await db.insert(stockAdjustmentTable).values(
    DEV_PRIZES.map((prize) => ({
      id: `dev_stock_${prize.id}`,
      prizeId: prize.id,
      delta: prize.quantity,
      reason: "initial" as const,
    })),
  );

  await db.insert(campaignTable).values({
    id: DEV_CAMPAIGN_ID,
    name: "Dev event",
    kitId: DEFAULT_KIT_ID,
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
        ENGINE_DB_MIGRATE_LOG_SOURCE,
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
      logKioskEvent("info", ENGINE_DB_MIGRATE_LOG_SOURCE, "lottery-seeded", {
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
    logKioskEvent(
      "error",
      ENGINE_DB_MIGRATE_LOG_SOURCE,
      "lottery-seed-failed",
      {
        error: getKioskErrorDiagnostics(error, "Lottery seed failed."),
      },
    );
    throw error;
  } finally {
    sqlite.close();
  }
}
