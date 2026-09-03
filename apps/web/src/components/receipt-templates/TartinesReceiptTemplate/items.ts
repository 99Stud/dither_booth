export type ReceiptItemRarity = "common" | "uncommon" | "rare" | "ultraRare";

export interface ReceiptItemDefinition {
  name: string;
  rarity: ReceiptItemRarity;
  /** Printed quantity; defaults to 1 when omitted. */
  quantity?: number;
  /** Fixed printed price; when omitted the item takes a share of the receipt total. */
  price?: number;
}

/** Per-slot probability, in percent, that the drawn item belongs to a tier. */
const RARITY_SHARES: Record<ReceiptItemRarity, number> = {
  common: 60,
  uncommon: 25,
  rare: 10,
  ultraRare: 5,
};

export const TARTINES_RECEIPT_ITEMS: readonly ReceiptItemDefinition[] = [
  { name: "Site Internet", rarity: "common" },
  { name: "3D assets", rarity: "common" },
  { name: "Illustrations", rarity: "common" },
  { name: "Bagage", rarity: "common" },
  { name: "Gazomètre", rarity: "common" },
  { name: "Stage (non rémunéré)", rarity: "common", price: 0 },
  { name: "Retours client", rarity: "common", quantity: 50 },
  { name: "AI slop", rarity: "uncommon" },
  { name: "Storyboard IA", rarity: "uncommon" },
  { name: "Affiche IA", rarity: "uncommon" },
  { name: "Selfie avec Justin Buisson", rarity: "uncommon" },
  { name: "Coup de raquette électrique", rarity: "rare" },
  { name: "Controle URSAFF", rarity: "rare" },
  { name: "Journée gratuite au local", rarity: "ultraRare" },
  { name: "Cul-sec de punch", rarity: "ultraRare" },
];

const ITEM_COUNT_PER_RARITY = TARTINES_RECEIPT_ITEMS.reduce<
  Record<ReceiptItemRarity, number>
>(
  (counts, item) => {
    counts[item.rarity] += 1;
    return counts;
  },
  { common: 0, uncommon: 0, rare: 0, ultraRare: 0 },
);

/**
 * Weight of a single item: its tier share spread evenly across the items of
 * that tier, so every tier keeps its target drop rate when items are added or
 * removed from the catalogue.
 */
const itemWeight = (item: ReceiptItemDefinition): number => {
  const tierCount = ITEM_COUNT_PER_RARITY[item.rarity];
  return tierCount === 0 ? 0 : RARITY_SHARES[item.rarity] / tierCount;
};

const shuffle = (items: ReceiptItemDefinition[]): ReceiptItemDefinition[] => {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [
      items[swapIndex] as ReceiptItemDefinition,
      items[index] as ReceiptItemDefinition,
    ];
  }
  return items;
};

/**
 * Draws `count` distinct items, each pick weighted by its rarity tier.
 * Picking happens without replacement, so the same item never shows up twice.
 */
export const pickWeightedReceiptItems = (
  count: number,
): ReceiptItemDefinition[] => {
  const pool = [...TARTINES_RECEIPT_ITEMS];

  if (count >= pool.length) {
    return shuffle(pool);
  }

  const picked: ReceiptItemDefinition[] = [];

  while (picked.length < count) {
    const totalWeight = pool.reduce(
      (total, item) => total + itemWeight(item),
      0,
    );
    let remainder = Math.random() * totalWeight;
    // Falls back to the last entry if floating-point drift eats the remainder.
    let pickIndex = pool.length - 1;

    for (const [index, item] of pool.entries()) {
      remainder -= itemWeight(item);
      if (remainder < 0) {
        pickIndex = index;
        break;
      }
    }

    const [pickedItem] = pool.splice(pickIndex, 1);
    if (pickedItem) {
      picked.push(pickedItem);
    }
  }

  return picked;
};
