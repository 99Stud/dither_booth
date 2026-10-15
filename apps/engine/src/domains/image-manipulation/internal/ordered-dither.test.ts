import { describe, expect, test } from "bun:test";

import { BLUE_NOISE_MASK_RANKS } from "./blue-noise-mask";
import { blueNoiseDither, buildToneLut } from "./ordered-dither";

/**
 * Gray that macOS's halftoner saw for each sRGB input, recovered by matching
 * its 1-bit output for flat patches against the decompiled threshold mask.
 */
const MACOS_HALFTONER_GRAY: Array<[input: number, gray: number]> = [
  [0, 0],
  [16, 14],
  [32, 24],
  [48, 36],
  [64, 49],
  [80, 63],
  [96, 77],
  [112, 93],
  [128, 109],
  [144, 125],
  [160, 143],
  [176, 160],
  [192, 179],
  [208, 197],
  [224, 217],
  [240, 236],
  [255, 255],
];

/** Dot coverage macOS printed for flat sRGB patches (measured via cupsfilter). */
const MACOS_INK_COVERAGE: Array<[input: number, ink: number]> = [
  [0, 1],
  [17, 0.945],
  [34, 0.898],
  [51, 0.851],
  [68, 0.796],
  [85, 0.738],
  [102, 0.676],
  [119, 0.609],
  [136, 0.539],
  [153, 0.468],
  [170, 0.397],
  [187, 0.32],
  [204, 0.243],
  [221, 0.164],
  [238, 0.082],
  [255, 0],
];

const flatPatch = (value: number, size = 128) =>
  blueNoiseDither(new Uint8Array(size * size).fill(value), size, size);

const inkCoverage = (dots: Uint8Array) =>
  dots.reduce((count, dot) => count + (dot === 0 ? 1 : 0), 0) / dots.length;

describe("blue-noise mask", () => {
  test("ranks every one of the 64x64 cells exactly once", () => {
    expect(Array.from(BLUE_NOISE_MASK_RANKS).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 4096 }, (_, index) => index),
    );
  });
});

describe("buildToneLut", () => {
  test.each(MACOS_HALFTONER_GRAY)(
    "maps sRGB %i to the gray macOS halftones (%i)",
    (input, gray) => {
      expect(
        Math.abs((buildToneLut()[input] ?? -1) - gray),
      ).toBeLessThanOrEqual(1);
    },
  );

  test("exposure brightens before the gamma re-encode", () => {
    const neutral = buildToneLut();
    const brighter = buildToneLut({ exposure: 2 });

    expect(brighter[128]).toBeGreaterThan(neutral[128] ?? 255);
    expect(brighter[255]).toBe(255);
  });

  test("a higher gamma prints lighter midtones", () => {
    expect(buildToneLut({ gamma: 2.2 })[128]).toBeGreaterThan(
      buildToneLut()[128] ?? 255,
    );
  });
});

describe("blueNoiseDither", () => {
  test.each(MACOS_INK_COVERAGE)(
    "prints sRGB %i with macOS's dot coverage (%f)",
    (input, ink) => {
      expect(Math.abs(inkCoverage(flatPatch(input)) - ink)).toBeLessThanOrEqual(
        0.015,
      );
    },
  );

  test("outputs only dots and paper", () => {
    const gradient = Uint8Array.from(
      { length: 256 * 64 },
      (_, index) => index % 256,
    );

    expect(new Set(blueNoiseDither(gradient, 256, 64))).toEqual(
      new Set([0, 255]),
    );
  });

  test("is deterministic and anchored to the image origin", () => {
    const tile = flatPatch(128, 64);
    const twoTiles = flatPatch(128, 128);

    expect(flatPatch(128, 64)).toEqual(tile);
    for (let y = 0; y < 64; y++) {
      expect(twoTiles.subarray(y * 128 + 64, y * 128 + 128)).toEqual(
        tile.subarray(y * 64, y * 64 + 64),
      );
    }
  });

  test("keeps every dot of a lighter gray at darker grays", () => {
    let lighter = flatPatch(255, 64);

    for (let value = 254; value >= 0; value--) {
      const darker = flatPatch(value, 64);
      for (let index = 0; index < darker.length; index++) {
        if (lighter[index] === 0) expect(darker[index]).toBe(0);
      }
      lighter = darker;
    }
  });
});
