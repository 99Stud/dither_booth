import { describe, expect, test } from "bun:test";

import { buildRarityBreakdown } from "./lottery.status";

describe("buildRarityBreakdown", () => {
  test("aggregates remaining by rarity and skips zeros", () => {
    expect(
      buildRarityBreakdown([
        { rarity: "common", remainingQuantity: 2 },
        { rarity: "common", remainingQuantity: 1 },
        { rarity: "legendary", remainingQuantity: 1 },
        { rarity: "rare", remainingQuantity: 0 },
      ]),
    ).toEqual([
      { rarity: "common", remaining: 3 },
      { rarity: "legendary", remaining: 1 },
    ]);
  });

  test("returns empty when nothing remains", () => {
    expect(
      buildRarityBreakdown([{ rarity: "epic", remainingQuantity: 0 }]),
    ).toEqual([]);
  });
});
