import type { DrawResult } from "@dither-booth/shared/lottery";

import { RARITY_TYPES } from "@dither-booth/shared/lottery";
import { describe, expect, it } from "bun:test";

import { getReelFaces, REEL_COUNT, REEL_STRIP } from "./slot-machine.utils";

const LOSS_DRAW: DrawResult = { outcome: "loss", prize: null };

/** Deterministic generator cycling through the given unit-interval values. */
const sequence = (values: number[]) => {
  let index = 0;

  return () => values[index++ % values.length] ?? 0;
};

describe("getReelFaces", () => {
  it("lands three of the prize rarity on a win", () => {
    for (const rarity of RARITY_TYPES) {
      const faces = getReelFaces({
        outcome: "win",
        prize: {
          id: "prize",
          rarity,
          title: "prize",
          winInstruction: "show this ticket",
        },
      });

      expect(faces).toEqual([rarity, rarity, rarity]);
    }
  });

  it("never lands three of a kind on a loss", () => {
    for (let seed = 0; seed < 500; seed += 1) {
      const faces = getReelFaces(LOSS_DRAW);

      expect(faces).toHaveLength(REEL_COUNT);
      expect(new Set(faces).size).toBeGreaterThan(1);
    }
  });

  it("breaks a random triple by swapping the last reel", () => {
    // Every pick resolves to the first strip icon, so the third one has to be
    // forced away from it.
    const faces = getReelFaces(LOSS_DRAW, sequence([0]));

    expect(faces[0]).toBe(REEL_STRIP[0]!);
    expect(faces[1]).toBe(REEL_STRIP[0]!);
    expect(faces[2]).not.toBe(REEL_STRIP[0]!);
  });
});
