import { describe, expect, test } from "bun:test";

import { getBayerRanks } from "./MaintenanceScreen.utils";

describe("getBayerRanks", () => {
  test("is the classic 2×2 and 4×4 Bayer matrix", () => {
    expect(getBayerRanks(2)).toEqual([0, 2, 3, 1]);
    expect(getBayerRanks(4)).toEqual([
      0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5,
    ]);
  });

  test("ranks every cell of a 16×16 grid exactly once", () => {
    const ranks = getBayerRanks(16);

    expect(ranks.toSorted((a, b) => a - b)).toEqual(
      Array.from({ length: 256 }, (_, index) => index),
    );
  });

  test("half the ranks make a checkerboard", () => {
    const lit = getBayerRanks(4).map((rank) => (rank < 8 ? 1 : 0));

    expect(lit).toEqual([1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1]);
  });
});
