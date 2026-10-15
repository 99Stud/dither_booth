import z from "zod";

/** Canonical rarity ladder */
export const RARITY_TYPES = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
] as const;

export const raritySchema = z.enum(RARITY_TYPES);

export type Rarity = z.infer<typeof raritySchema>;

/**
 * The draw weight a prize gets from its rarity, unless set per prize.
 * Next to the default no-win weight of 50, a common prize is about 1 in 2.3
 * and a legendary one about 1 in 26 (fewer prizes in the draw, better odds).
 */
export const RARITY_DEFAULT_WEIGHTS: Record<Rarity, number> = {
  common: 40,
  uncommon: 20,
  rare: 8,
  epic: 4,
  legendary: 2,
};

export const DRAW_OUTCOMES = ["win", "loss"] as const;

export const drawOutcomeSchema = z.enum(DRAW_OUTCOMES);

export type DrawOutcome = z.infer<typeof drawOutcomeSchema>;

export type DrawResult =
  | { outcome: "loss"; prize: null }
  | {
      outcome: "win";
      prize: {
        id: string;
        rarity: Rarity;
        title: string;
        winInstruction: string;
      };
    };

export type LotteryStatusRarityBreakdown = {
  rarity: Rarity;
  remaining: number;
};

export type LotteryStatus = {
  enabled: boolean;
  remainingPrizes: number;
  rarityBreakdown: LotteryStatusRarityBreakdown[];
  /** ISO 8601 instant of the latest win, or null if none. */
  lastWinAt: string | null;
  totalDraws: number;
};
