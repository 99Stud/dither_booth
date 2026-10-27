import type { Rarity } from "@dither-booth/shared/lottery";

import {
  RARITY_DEFAULT_WEIGHTS,
  RARITY_TYPES,
} from "@dither-booth/shared/lottery";

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
  /** When each drawable prize is expected to run out, by id; absent past the horizon. */
  prizeRunsOutAfterMinutes: Record<string, number>;
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
  const prizeRunsOutAfterMinutes: Record<string, number> = {};

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
      const next = Math.max(current - (wins * prize.weight) / weight, 0);
      left.set(prize.id, next);
      if (next < 0.5) prizeRunsOutAfterMinutes[prize.id] ??= minute;
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
    prizeRunsOutAfterMinutes,
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

/** How rare a prize can be set, as "1 in N" guests: the slider's stops. */
export const PRIZE_ONE_IN_STOPS = [
  1000, 500, 300, 200, 150, 100, 75, 50, 40, 30, 25, 20, 15, 12, 10, 8, 6, 5, 4,
  3, 2.5, 2, 1.5,
] as const;

/** The slider stop closest to a chance, on a log scale. */
export const closestOneInStop = (chance: number): number => {
  if (chance <= 0) return 0;
  const oneIn = Math.log(1 / chance);
  let best = 0;
  PRIZE_ONE_IN_STOPS.forEach((stop, index) => {
    const bestStop = PRIZE_ONE_IN_STOPS[best] ?? stop;
    if (Math.abs(Math.log(stop) - oneIn) < Math.abs(Math.log(bestStop) - oneIn))
      best = index;
  });
  return best;
};

/**
 * The prize weight that gives one guest `chance` to win it, next to the rest
 * of the draw (`otherWeight`: the no-win weight and the other in-stock
 * prizes): the inverse of chance = w / (w + other). Three significant digits,
 * so a rare prize next to small weights never rounds to 0. Null when the
 * prize is the whole draw, where any weight means every guest wins it.
 */
export const weightForPrizeChance = (
  chance: number,
  otherWeight: number,
): number | null => {
  if (otherWeight <= 0 || chance >= 1) return null;
  const clamped = Math.max(chance, 0.0001);
  return Number(((otherWeight * clamped) / (1 - clamped)).toPrecision(3));
};

export type PrizePreview = {
  /** Chance one guest wins this prize, once it is in stock. */
  chance: number;
  /** Chance one guest wins any other prize. */
  otherChance: number;
  /** Chance one guest wins nothing. */
  noPrizeChance: number;
  /** Chance to win anything, without this prize (or with its saved weight). */
  winChanceBefore: number;
  /** Chance to win anything with this prize as set in the form. */
  winChanceAfter: number;
  /** No-win weight plus the other in-stock prizes. */
  otherWeight: number;
  /** About how long `quantity` lasts, or null if never won. */
  lastsMinutes: number | null;
};

/**
 * What a prize's settings mean before saving it: its odds next to the rest
 * of the draw, how it moves the overall win chance, and about how long its
 * stock lasts at `guestsPerHour` (pause after a win included; the other
 * prizes running out is not, so it is an estimate).
 */
export const previewPrize = ({
  prizeId,
  weight,
  quantity,
  noWinWeight,
  cooldownMinutes,
  guestsPerHour,
  prizes,
}: {
  /** The prize being edited, or null for a new one. */
  prizeId: string | null;
  weight: number;
  quantity: number;
  noWinWeight: number;
  cooldownMinutes: number;
  guestsPerHour: number;
  prizes: OddsPrize[];
}): PrizePreview => {
  const others = getDrawablePrizes(prizes).filter(
    (prize) => prize.id !== prizeId,
  );
  const othersWeight = sumWeights(others);
  const noWin = Math.max(noWinWeight, 0);
  const ownWeight = Math.max(weight, 0);
  const total = othersWeight + noWin + ownWeight;
  const chanceOf = (value: number) => (total > 0 ? value / total : 0);

  const { winChance: winChanceBefore } = computeOdds({ noWinWeight, prizes });
  const winChanceAfter = chanceOf(othersWeight + ownWeight);
  const chance = chanceOf(ownWeight);

  const guestsPerMinute = Math.max(guestsPerHour, 0) / 60;
  const winsPerMinute =
    guestsPerMinute > 0 && winChanceAfter > 0
      ? 1 /
        (1 / (guestsPerMinute * winChanceAfter) + Math.max(cooldownMinutes, 0))
      : 0;
  const ownWinsPerMinute =
    winChanceAfter > 0 ? (winsPerMinute * chance) / winChanceAfter : 0;

  return {
    chance,
    otherChance: chanceOf(othersWeight),
    noPrizeChance: chanceOf(noWin),
    winChanceBefore,
    winChanceAfter,
    otherWeight: othersWeight + noWin,
    lastsMinutes:
      ownWinsPerMinute > 0 && quantity > 0 ? quantity / ownWinsPerMinute : null,
  };
};

/** Whether a prize still uses its rarity's default weight. */
export const usesRarityDefaultWeight = (prize: {
  rarity: Rarity;
  weight: number;
}): boolean => prize.weight === RARITY_DEFAULT_WEIGHTS[prize.rarity];

/**
 * The weight after a rarity change: a prize on its old rarity's default
 * follows the new rarity's default; a custom weight is kept.
 */
export const weightAfterRarityChange = ({
  weight,
  from,
  to,
}: {
  weight: number;
  from: Rarity;
  to: Rarity;
}): number =>
  usesRarityDefaultWeight({ rarity: from, weight })
    ? RARITY_DEFAULT_WEIGHTS[to]
    : weight;

/** "1 h 40 min" / "25 min". */
export const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};
