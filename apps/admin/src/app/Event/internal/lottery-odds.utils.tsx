import type { Rarity } from "@dither-booth/shared/lottery";

import { RARITY_TYPES } from "@dither-booth/shared/lottery";

/** What the odds need from a prize: the engine's draw inputs. */
export type OddsPrize = {
  id: string;
  title: string;
  rarity: Rarity;
  weight: number;
  remainingQuantity: number;
};

/** Rarer first: the order of the odds bar and its legend. */
export const RARITIES_RAREST_FIRST = [...RARITY_TYPES].reverse() as Rarity[];

/** Prizes the engine can draw: in stock and weighted (`runLotteryDraw`). */
export const getDrawablePrizes = <T extends OddsPrize>(prizes: T[]): T[] =>
  prizes.filter((prize) => prize.remainingQuantity > 0 && prize.weight > 0);

const sumWeights = (prizes: OddsPrize[]) =>
  prizes.reduce((sum, prize) => sum + prize.weight, 0);

export type LotteryOdds = {
  /** Chance one guest wins any prize. */
  winChance: number;
  /** Chance per rarity that still has stock, rarest first. */
  byRarity: Array<{ rarity: Rarity; chance: number; remaining: number }>;
  /** Chance per drawable prize, rarest first. */
  byPrize: Array<OddsPrize & { chance: number }>;
};

/**
 * The odds of a single draw, exactly as the engine rolls them: each in-stock
 * prize wins with weight / (no-win weight + prize weights). The cooldown is
 * not part of a single draw; see `forecastPrizes`.
 */
export const computeOdds = ({
  noWinWeight,
  prizes,
}: {
  noWinWeight: number;
  prizes: OddsPrize[];
}): LotteryOdds => {
  const drawable = getDrawablePrizes(prizes);
  const total = sumWeights(drawable) + Math.max(noWinWeight, 0);
  const chanceOf = (weight: number) => (total > 0 ? weight / total : 0);
  const rank = (rarity: Rarity) => RARITIES_RAREST_FIRST.indexOf(rarity);

  return {
    winChance: chanceOf(sumWeights(drawable)),
    byRarity: RARITIES_RAREST_FIRST.flatMap((rarity) => {
      const ofRarity = drawable.filter((prize) => prize.rarity === rarity);
      if (ofRarity.length === 0) return [];
      return [
        {
          rarity,
          chance: chanceOf(sumWeights(ofRarity)),
          remaining: ofRarity.reduce(
            (sum, prize) => sum + prize.remainingQuantity,
            0,
          ),
        },
      ];
    }),
    byPrize: drawable
      .map((prize) => ({ ...prize, chance: chanceOf(prize.weight) }))
      .toSorted((a, b) => rank(a.rarity) - rank(b.rarity)),
  };
};

/**
 * The no-win weight that gives `winChance` with these prize weights: the
 * inverse of winChance = W / (W + noWin). Rounded to 2 decimals.
 */
export const noWinWeightForChance = (
  winChance: number,
  totalPrizeWeight: number,
): number => {
  if (winChance >= 1 || totalPrizeWeight <= 0) return 0;
  const clamped = Math.max(winChance, 0.001);
  return Math.round(((totalPrizeWeight * (1 - clamped)) / clamped) * 100) / 100;
};

/** "1 in 4": how people read odds. */
export const formatOneIn = (chance: number): string => {
  if (chance <= 0) return "never";
  if (chance >= 1) return "every guest";
  const oneIn = 1 / chance;
  return `1 in ${oneIn < 10 ? Math.round(oneIn * 10) / 10 : Math.round(oneIn)}`;
};

export const formatPercent = (chance: number): string => {
  const percent = chance * 100;
  if (percent > 0 && percent < 1) return "<1%";
  return `${Math.round(percent)}%`;
};

export type PrizeForecast = {
  /** Expected prizes left, every `stepMinutes`. */
  points: Array<{ minute: number; left: number }>;
  /** Expected wins per hour at the start, cooldown included. */
  winsPerHour: number;
  /** Most wins per hour the cooldown allows, or null without cooldown. */
  cooldownCapPerHour: number | null;
  /** When the stock is expected to run out, or null past the horizon. */
  runsOutAfterMinutes: number | null;
};

/**
 * Expected stock over time for a steady flow of guests. After each win the
 * cooldown blocks every win for `cooldownMinutes`, so on average one win
 * takes 1 / (guests per minute × win chance) + cooldown minutes. Prizes
 * leave the draw as they run out, which lowers the win chance, so the curve
 * bends: it is an expectation, not a promise.
 */
export const forecastPrizes = ({
  prizes,
  noWinWeight,
  cooldownMinutes,
  guestsPerHour,
  horizonMinutes = 12 * 60,
  stepMinutes = 5,
}: {
  prizes: OddsPrize[];
  noWinWeight: number;
  cooldownMinutes: number;
  guestsPerHour: number;
  horizonMinutes?: number;
  stepMinutes?: number;
}): PrizeForecast => {
  const guestsPerMinute = Math.max(guestsPerHour, 0) / 60;
  const stock = new Map(
    getDrawablePrizes(prizes).map((prize) => [prize.id, prize] as const),
  );
  const left = new Map(
    [...stock.values()].map((prize) => [prize.id, prize.remainingQuantity]),
  );
  const totalLeft = () => [...left.values()].reduce((sum, n) => sum + n, 0);

  const winsPerMinute = () => {
    const inStock = [...stock.values()].filter(
      (prize) => (left.get(prize.id) ?? 0) > 0,
    );
    const weight = sumWeights(inStock);
    const winChance =
      weight + Math.max(noWinWeight, 0) > 0
        ? weight / (weight + Math.max(noWinWeight, 0))
        : 0;
    if (guestsPerMinute <= 0 || winChance <= 0) return { rate: 0, inStock };
    return {
      rate:
        1 / (1 / (guestsPerMinute * winChance) + Math.max(cooldownMinutes, 0)),
      inStock,
    };
  };

  const points = [{ minute: 0, left: totalLeft() }];
  let runsOutAfterMinutes: number | null = null;

  for (
    let minute = stepMinutes;
    minute <= horizonMinutes;
    minute += stepMinutes
  ) {
    const { rate, inStock } = winsPerMinute();
    const wins = rate * stepMinutes;
    const weight = sumWeights(inStock);

    for (const prize of inStock) {
      const current = left.get(prize.id) ?? 0;
      left.set(prize.id, Math.max(current - (wins * prize.weight) / weight, 0));
    }

    const remaining = totalLeft();
    points.push({ minute, left: Math.round(remaining * 10) / 10 });

    if (remaining < 0.5 && runsOutAfterMinutes === null) {
      runsOutAfterMinutes = minute;
      break;
    }
  }

  return {
    points,
    winsPerHour:
      winsPerMinuteAtStart(
        prizes,
        noWinWeight,
        cooldownMinutes,
        guestsPerMinute,
      ) * 60,
    cooldownCapPerHour: cooldownMinutes > 0 ? 60 / cooldownMinutes : null,
    runsOutAfterMinutes,
  };
};

const winsPerMinuteAtStart = (
  prizes: OddsPrize[],
  noWinWeight: number,
  cooldownMinutes: number,
  guestsPerMinute: number,
) => {
  const { winChance } = computeOdds({ noWinWeight, prizes });
  if (guestsPerMinute <= 0 || winChance <= 0) return 0;
  return 1 / (1 / (guestsPerMinute * winChance) + Math.max(cooldownMinutes, 0));
};

/** "1 h 40 min" / "25 min". */
export const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};
