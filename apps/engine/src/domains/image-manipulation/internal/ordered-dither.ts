import { BLUE_NOISE_MASK_RANKS, BLUE_NOISE_MASK_SIZE } from "./blue-noise-mask";

/**
 * Gamma macOS encodes gray in before halftoning a 1-bit printer page.
 * `cgpdftoraster` renders into kCGColorSpaceGenericGray (gamma 1.8), so sRGB
 * midtones reach the halftoner darker than their code value.
 */
export const MACOS_GRAY_GAMMA = 1.8;

const MASK_LEVELS = 255;
const MASK_INDEX_MASK = BLUE_NOISE_MASK_SIZE - 1;

/** Rank 0..4095 spread over thresholds 0..254, like Apple's 255-level mask. */
const BLUE_NOISE_THRESHOLDS = Uint8Array.from(BLUE_NOISE_MASK_RANKS, (rank) =>
  Math.floor((rank * MASK_LEVELS) / BLUE_NOISE_MASK_RANKS.length),
);

const srgbToLinear = (value: number) => {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/**
 * Maps an sRGB gray value to the gray the halftoner compares against:
 * linearize, apply exposure, then re-encode with `gamma`. With the default
 * gamma this matches macOS to within one code value.
 */
export const buildToneLut = ({
  exposure = 1,
  gamma = MACOS_GRAY_GAMMA,
}: { exposure?: number; gamma?: number } = {}) =>
  Uint8Array.from({ length: 256 }, (_, value) => {
    const linear = Math.min(1, srgbToLinear(value) * exposure);
    return Math.round(255 * linear ** (1 / gamma));
  });

/**
 * Ordered dither against a 64x64 blue-noise mask anchored at the image
 * origin. Returns one byte per pixel: 0 for a printed dot, 255 for paper.
 */
export const blueNoiseDither = (
  gray: Uint8Array,
  width: number,
  height: number,
  toneLut: Uint8Array = buildToneLut(),
) => {
  const output = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    const maskRow = (y & MASK_INDEX_MASK) * BLUE_NOISE_MASK_SIZE;
    const rowOffset = y * width;

    for (let x = 0; x < width; x++) {
      const index = rowOffset + x;
      const darkness = MASK_LEVELS - (toneLut[gray[index] ?? 255] ?? 255);
      const threshold =
        BLUE_NOISE_THRESHOLDS[maskRow + (x & MASK_INDEX_MASK)] ?? 0;

      output[index] = threshold < darkness ? 0 : 255;
    }
  }

  return output;
};
