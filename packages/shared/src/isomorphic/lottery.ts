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
