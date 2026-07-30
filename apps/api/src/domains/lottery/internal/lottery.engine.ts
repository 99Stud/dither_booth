import type { Rarity } from "@dither-booth/shared/lottery";

import type { DrawResult } from "./lottery.types";

const MS_PER_MINUTE = 60_000;

export const isLotteryOpen = (lottery: { enabled: boolean }): boolean => {
  return lottery.enabled;
};

export const isWithinWinCooldown = (params: {
  lastWinAt: Date | null;
  now: Date;
  winCooldownMinutes: number;
}): boolean => {
  const { lastWinAt, now, winCooldownMinutes } = params;

  if (winCooldownMinutes <= 0 || !lastWinAt) return false;

  const elapsedMs = now.getTime() - lastWinAt.getTime();

  return elapsedMs < winCooldownMinutes * MS_PER_MINUTE;
};

type DrawablePrize = {
  id: string;
  weight: number;
  remainingQuantity: number;
  rarity: Rarity;
  title: string;
  winInstruction: string;
};

export const runLotteryDraw = (params: {
  noWinWeight: number;
  prizes: DrawablePrize[];
  random?: () => number;
}): DrawResult => {
  const { noWinWeight, prizes, random = Math.random } = params;

  const eligiblePrizes = prizes.filter(
    (prize) => prize.remainingQuantity > 0 && prize.weight > 0,
  );

  const totalPrizeWeight = eligiblePrizes.reduce(
    (sum, prize) => sum + prize.weight,
    0,
  );
  const totalWeight = totalPrizeWeight + Math.max(noWinWeight, 0);

  if (totalWeight <= 0) {
    return { outcome: "loss", prize: null };
  }

  let roll = random() * totalWeight;

  for (const prize of eligiblePrizes) {
    roll -= prize.weight;

    if (roll < 0) {
      return {
        outcome: "win",
        prize: {
          id: prize.id,
          rarity: prize.rarity,
          title: prize.title,
          winInstruction: prize.winInstruction,
        },
      };
    }
  }

  return { outcome: "loss", prize: null };
};
