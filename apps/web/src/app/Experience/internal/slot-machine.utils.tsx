import type { DrawResult, Rarity } from "@dither-booth/shared/lottery";

import { RARITY_TYPES } from "@dither-booth/shared/lottery";

export const REEL_COUNT = 3;

export type ReelFaces = readonly [Rarity, Rarity, Rarity];

/** The icon order printed on every reel strip, top to bottom. */
export const REEL_STRIP: readonly Rarity[] = RARITY_TYPES;

const pickRarity = (random: () => number): Rarity =>
  REEL_STRIP[Math.floor(random() * REEL_STRIP.length)] ?? REEL_STRIP[0]!;

/**
 * Faces the reels land on. A win is always the prize's rarity three times; a
 * loss is random but never three of a kind, since that is the only pattern
 * the player reads as a jackpot.
 */
export const getReelFaces = (
  drawResult: DrawResult,
  random: () => number = Math.random,
): ReelFaces => {
  if (drawResult.outcome === "win") {
    const { rarity } = drawResult.prize;

    return [rarity, rarity, rarity];
  }

  const first = pickRarity(random);
  const second = pickRarity(random);
  let third = pickRarity(random);

  if (first === second && second === third) {
    const others = REEL_STRIP.filter((rarity) => rarity !== first);

    third = others[Math.floor(random() * others.length)] ?? others[0]!;
  }

  return [first, second, third];
};
