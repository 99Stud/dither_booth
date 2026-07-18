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
  remainingLots: number;
  rarityBreakdown: LotteryStatusRarityBreakdown[];
  /** ISO 8601 instant of the latest win, or null if none. */
  lastWinAt: string | null;
  totalDraws: number;
};
