import type { LotteryStatus, Rarity } from "@dither-booth/shared/lottery";
import { RARITY_TYPES } from "@dither-booth/shared/lottery";
import { and, count, desc, eq, isNotNull } from "drizzle-orm";

import type { DB } from "#db/internal/db.types";
import { drawTable, lotteryTable, prizeTable } from "#db/internal/db.schema";

export const EMPTY_LOTTERY_STATUS = {
  enabled: false,
  remainingLots: 0,
  rarityBreakdown: [],
  lastWinAt: null,
  totalDraws: 0,
} as const satisfies LotteryStatus;

export function buildRarityBreakdown(
  prizes: Array<{ rarity: Rarity; remainingQuantity: number }>,
): LotteryStatus["rarityBreakdown"] {
  const remainingByRarity = new Map<Rarity, number>(
    RARITY_TYPES.map((rarity) => [rarity, 0]),
  );

  for (const prize of prizes) {
    remainingByRarity.set(
      prize.rarity,
      (remainingByRarity.get(prize.rarity) ?? 0) + prize.remainingQuantity,
    );
  }

  return RARITY_TYPES.flatMap((rarity) => {
    const remaining = remainingByRarity.get(rarity) ?? 0;
    if (remaining <= 0) return [];
    return [{ rarity, remaining }];
  });
}

export async function getLotteryStatusForDb(db: DB): Promise<LotteryStatus> {
  const lottery = await db.query.lotteryTable.findFirst({
    where: eq(lotteryTable.enabled, true),
  });

  if (!lottery) {
    return EMPTY_LOTTERY_STATUS;
  }

  const prizes = await db.query.prizeTable.findMany({
    where: eq(prizeTable.lotteryId, lottery.id),
  });

  const remainingLots = prizes.reduce(
    (sum, prize) => sum + prize.remainingQuantity,
    0,
  );

  const rarityBreakdown = buildRarityBreakdown(prizes);

  const lastWin = await db.query.drawTable.findFirst({
    where: and(
      eq(drawTable.lotteryId, lottery.id),
      isNotNull(drawTable.prizeId),
    ),
    orderBy: [desc(drawTable.createdAt)],
  });

  const [drawCountRow] = await db
    .select({ value: count() })
    .from(drawTable)
    .where(eq(drawTable.lotteryId, lottery.id));

  return {
    enabled: true,
    remainingLots,
    rarityBreakdown,
    lastWinAt: lastWin?.createdAt?.toISOString() ?? null,
    totalDraws: drawCountRow?.value ?? 0,
  };
}
