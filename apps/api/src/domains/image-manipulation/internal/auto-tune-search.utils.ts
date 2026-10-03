import {
  ColorScheme,
  ditherImage,
  type DitherMode,
  type ImageBuffer,
} from "@opendisplay/epaper-dithering";
import sharp from "sharp";

import type { PrintConfigRow } from "#domains/print-configuration/print-configuration.service";

import { COLOR_SCHEME_CODE_OPTIONS } from "#domains/print-configuration/internal/print-configuration.constants";

// A third of PRINT_WIDTH_PX: the WASM dither dominates runtime (~8ms per call
// at this size), which keeps ~200 candidate renders around 2s.
const ANALYSIS_SIZE_PX = 192;
// Booth frames a person in the middle. Skin at ~50% sRGB dithers into a flat
// checkerboard, so the target lifts that center off the mid-gray and stretches
// features (eyes, hair, mouth) away from it.
const PORTRAIT_SUBJECT_SRGB = 0.84;
const PORTRAIT_CONTRAST = 2.2;
const PORTRAIT_CENTER_FRACTION = 0.5;
const PORTRAIT_SUBJECT_FLOOR = 0.08;
// Approximates eye/ink spread over the dither pattern at analysis scale.
const BLUR_SIGMA_PX = 2;
const BLUR_RADIUS_PX = 5;
const GRADIENT_WEIGHT = 0.01;
// Person sits in the middle of a booth frame. Face error outweighs the backdrop.
const CENTER_WEIGHT_SIGMA = 0.28;
// Small pull toward neutral settings so noise-level score differences do not
// pick extreme values.
const REGULARIZATION_WEIGHT = 0.0005;
// Whole stops around the heuristic seed; refine checks the half stops.
const COARSE_EXPOSURE_STOP_OFFSETS = [-1, 0, 1];
const COARSE_TONE_STRENGTHS = [0, 0.5, 1];
const REFINE_EXPOSURE_STOP_STEP = 0.5;
const REFINE_TONE_STRENGTH_RADIUS = 0.25;
const REFINE_TONE_STRENGTH_STEP = 0.05;
const MIN_EXPOSURE_STOPS = -2;
const MAX_EXPOSURE_STOPS = 2;

export type AutoTuneBaseConfig = Pick<
  PrintConfigRow,
  | "colorSchemeCode"
  | "ditherModeCode"
  | "serpentine"
  | "saturation"
  | "threshold"
>;

type AutoTuneColorSchemeCode = (typeof COLOR_SCHEME_CODE_OPTIONS)[number];

export interface AutoTuneCandidate {
  colorSchemeCode: AutoTuneColorSchemeCode;
  exposureStops: number;
  highlights: number;
  shadows: number;
}

export interface AutoTuneSearchResult {
  colorSchemeCode: AutoTuneColorSchemeCode;
  exposure: number;
  highlights: number;
  shadows: number;
}

interface GrayImage {
  data: Float32Array;
  height: number;
  width: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const snap = (value: number, step: number) =>
  Number((Math.round(value / step) * step).toFixed(4));

const srgbToLinear = (value: number) =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

const linearToSrgb = (value: number) =>
  value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;

// Rec. 601 luma, matching sharp's grayscale() used by the raster stage.
const rgbToLuma = (r: number, g: number, b: number) =>
  0.299 * r + 0.587 * g + 0.114 * b;

const getPercentile = (sorted: Float32Array, percentile: number) => {
  if (sorted.length === 0) {
    return 0;
  }

  const index = clamp(
    Math.round(percentile * (sorted.length - 1)),
    0,
    sorted.length - 1,
  );

  return sorted[index] ?? 0;
};

const getLinearLuminance = (image: ImageBuffer) => {
  const pixelCount = image.width * image.height;
  const luminance = new Float32Array(pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    const r = srgbToLinear((image.data[offset] ?? 0) / 255);
    const g = srgbToLinear((image.data[offset + 1] ?? 0) / 255);
    const b = srgbToLinear((image.data[offset + 2] ?? 0) / 255);

    luminance[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  return luminance;
};

const getCenterMedianSrgb = (
  srgb: Float32Array,
  width: number,
  height: number,
) => {
  const x0 = Math.floor((width * (1 - PORTRAIT_CENTER_FRACTION)) / 2);
  const y0 = Math.floor((height * (1 - PORTRAIT_CENTER_FRACTION)) / 2);
  const x1 = Math.ceil((width * (1 + PORTRAIT_CENTER_FRACTION)) / 2);
  const y1 = Math.ceil((height * (1 + PORTRAIT_CENTER_FRACTION)) / 2);
  const samples = new Float32Array(Math.max(0, (x1 - x0) * (y1 - y0)));
  let count = 0;

  for (let y = y0; y < y1; y++) {
    const row = y * width;

    for (let x = x0; x < x1; x++) {
      samples[count] = srgb[row + x] ?? 0;
      count++;
    }
  }

  samples.subarray(0, count).sort();

  return getPercentile(samples.subarray(0, count), 0.5);
};

export const buildTarget = (
  linearLuminance: Float32Array,
  exposure: number,
  size: { height: number; width: number },
): Float32Array => {
  const exposed = new Float32Array(linearLuminance.length);

  for (let i = 0; i < linearLuminance.length; i++) {
    exposed[i] = linearToSrgb(
      Math.min(1, (linearLuminance[i] ?? 0) * exposure),
    );
  }

  if (size.width === 0 || size.height === 0) {
    return exposed;
  }

  const subject = getCenterMedianSrgb(exposed, size.width, size.height);
  const gain =
    PORTRAIT_SUBJECT_SRGB / Math.max(subject, PORTRAIT_SUBJECT_FLOOR);

  for (let i = 0; i < exposed.length; i++) {
    const shifted = Math.min(1, (exposed[i] ?? 0) * gain);

    exposed[i] = clamp(
      PORTRAIT_SUBJECT_SRGB +
        (shifted - PORTRAIT_SUBJECT_SRGB) * PORTRAIT_CONTRAST,
      0,
      1,
    );
  }

  return exposed;
};

const getPortraitExposureBiasStops = (
  linearLuminance: Float32Array,
  exposure: number,
  size: { height: number; width: number },
) => {
  if (size.width === 0 || size.height === 0) {
    return 0;
  }

  const exposed = new Float32Array(linearLuminance.length);

  for (let i = 0; i < linearLuminance.length; i++) {
    exposed[i] = linearToSrgb(
      Math.min(1, (linearLuminance[i] ?? 0) * exposure),
    );
  }

  const subject = Math.max(
    getCenterMedianSrgb(exposed, size.width, size.height),
    PORTRAIT_SUBJECT_FLOOR,
  );
  const subjectLinear = srgbToLinear(subject);
  const targetLinear = srgbToLinear(PORTRAIT_SUBJECT_SRGB);

  if (subjectLinear <= 0) {
    return 0;
  }

  return clamp(
    Math.round(Math.log2(targetLinear / subjectLinear)),
    MIN_EXPOSURE_STOPS,
    MAX_EXPOSURE_STOPS,
  );
};

export const renderCandidate = (
  image: ImageBuffer,
  baseConfig: AutoTuneBaseConfig,
  candidate: AutoTuneCandidate,
): GrayImage => {
  const dithered = ditherImage(image, candidate.colorSchemeCode, {
    mode: baseConfig.ditherModeCode as DitherMode,
    serpentine: baseConfig.serpentine,
    exposure: 2 ** candidate.exposureStops,
    saturation: baseConfig.saturation,
    shadows: candidate.shadows,
    highlights: candidate.highlights,
  });

  // Mirrors the raster stage: grayscale then hard threshold to 1-bit.
  const paletteWhite = dithered.palette.map((color) =>
    rgbToLuma(color.r, color.g, color.b) >= baseConfig.threshold ? 1 : 0,
  );
  const data = new Float32Array(dithered.indices.length);

  for (let i = 0; i < dithered.indices.length; i++) {
    data[i] = paletteWhite[dithered.indices[i] ?? 0] ?? 0;
  }

  return { data, width: dithered.width, height: dithered.height };
};

const buildGaussianKernel = (sigma: number, radius: number) => {
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;

  for (let i = -radius; i <= radius; i++) {
    const weight = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = weight;
    sum += weight;
  }

  for (let i = 0; i < kernel.length; i++) {
    kernel[i] = (kernel[i] ?? 0) / sum;
  }

  return kernel;
};

const BLUR_KERNEL = buildGaussianKernel(BLUR_SIGMA_PX, BLUR_RADIUS_PX);

export const blurImage = (image: GrayImage): GrayImage => {
  const { data, width, height } = image;
  const horizontal = new Float32Array(data.length);
  const output = new Float32Array(data.length);

  for (let y = 0; y < height; y++) {
    const row = y * width;

    for (let x = 0; x < width; x++) {
      let sum = 0;

      for (let k = -BLUR_RADIUS_PX; k <= BLUR_RADIUS_PX; k++) {
        const sx = clamp(x + k, 0, width - 1);
        sum += (data[row + sx] ?? 0) * (BLUR_KERNEL[k + BLUR_RADIUS_PX] ?? 0);
      }

      horizontal[row + x] = sum;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;

      for (let k = -BLUR_RADIUS_PX; k <= BLUR_RADIUS_PX; k++) {
        const sy = clamp(y + k, 0, height - 1);
        sum +=
          (horizontal[sy * width + x] ?? 0) *
          (BLUR_KERNEL[k + BLUR_RADIUS_PX] ?? 0);
      }

      output[y * width + x] = sum;
    }
  }

  return { data: output, width, height };
};

const getGradientMagnitude = (image: GrayImage) => {
  const { data, width, height } = image;
  const output = new Float32Array(data.length);

  for (let y = 0; y < height; y++) {
    const up = clamp(y - 1, 0, height - 1) * width;
    const down = clamp(y + 1, 0, height - 1) * width;
    const row = y * width;

    for (let x = 0; x < width; x++) {
      const left = clamp(x - 1, 0, width - 1);
      const right = clamp(x + 1, 0, width - 1);
      const dx = (data[row + right] ?? 0) - (data[row + left] ?? 0);
      const dy = (data[down + x] ?? 0) - (data[up + x] ?? 0);

      output[row + x] = Math.hypot(dx, dy);
    }
  }

  return output;
};

const getCorrelation = (a: Float32Array, b: Float32Array) => {
  const length = Math.min(a.length, b.length);

  if (length === 0) {
    return 0;
  }

  let sumA = 0;
  let sumB = 0;

  for (let i = 0; i < length; i++) {
    sumA += a[i] ?? 0;
    sumB += b[i] ?? 0;
  }

  const meanA = sumA / length;
  const meanB = sumB / length;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;

  for (let i = 0; i < length; i++) {
    const da = (a[i] ?? 0) - meanA;
    const db = (b[i] ?? 0) - meanB;
    covariance += da * db;
    varianceA += da * da;
    varianceB += db * db;
  }

  if (varianceA === 0 || varianceB === 0) {
    return 0;
  }

  return covariance / Math.sqrt(varianceA * varianceB);
};

export interface ScoreTarget {
  blurred: GrayImage;
  gradient: Float32Array;
}

export const prepareScoreTarget = (target: GrayImage): ScoreTarget => {
  const blurred = blurImage(target);

  return { blurred, gradient: getGradientMagnitude(blurred) };
};

const getCenterWeight = (index: number, width: number, height: number) => {
  const x = (index % width) + 0.5;
  const y = Math.floor(index / width) + 0.5;
  const dx = x / width - 0.5;
  const dy = y / height - 0.5;

  return Math.exp(-(dx * dx + dy * dy) / (2 * CENTER_WEIGHT_SIGMA ** 2));
};

export const scoreCandidate = (
  rendered: GrayImage,
  target: ScoreTarget,
): number => {
  const blurred = blurImage(rendered);
  const targetData = target.blurred.data;
  let squaredError = 0;
  let weightSum = 0;

  for (let i = 0; i < blurred.data.length; i++) {
    const weight = getCenterWeight(i, blurred.width, blurred.height);
    const delta = (blurred.data[i] ?? 0) - (targetData[i] ?? 0);

    squaredError += weight * delta * delta;
    weightSum += weight;
  }

  const mse = squaredError / Math.max(weightSum, 1e-6);
  const gradientCorrelation = getCorrelation(
    getGradientMagnitude(blurred),
    target.gradient,
  );

  return mse + GRADIENT_WEIGHT * (1 - gradientCorrelation);
};

const getRegularization = (candidate: AutoTuneCandidate) =>
  REGULARIZATION_WEIGHT *
  (Math.abs(candidate.exposureStops) / 2 +
    candidate.shadows +
    candidate.highlights);

const buildToneStrengthRange = (center: number) => {
  const values: Array<number> = [];
  const start = clamp(center - REFINE_TONE_STRENGTH_RADIUS, 0, 1);
  const end = clamp(center + REFINE_TONE_STRENGTH_RADIUS, 0, 1);

  for (
    let value = start;
    value <= end + 1e-9;
    value += REFINE_TONE_STRENGTH_STEP
  ) {
    values.push(snap(value, REFINE_TONE_STRENGTH_STEP));
  }

  return values;
};

export const prepareAnalysisImage = async (
  buffer: Buffer<ArrayBuffer>,
): Promise<ImageBuffer> => {
  const { data, info } = await sharp(buffer)
    .resize({
      width: ANALYSIS_SIZE_PX,
      height: ANALYSIS_SIZE_PX,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#fff" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(data),
  };
};

export const searchBestDitherConfig = (
  image: ImageBuffer,
  baseConfig: AutoTuneBaseConfig,
): AutoTuneSearchResult => {
  const linearLuminance = getLinearLuminance(image);
  const size = { width: image.width, height: image.height };
  const target = prepareScoreTarget({
    data: buildTarget(linearLuminance, 1, size),
    width: image.width,
    height: image.height,
  });

  let best: { candidate: AutoTuneCandidate; score: number } | undefined;

  const evaluate = (candidate: AutoTuneCandidate) => {
    const score =
      scoreCandidate(renderCandidate(image, baseConfig, candidate), target) +
      getRegularization(candidate);

    if (!best || score < best.score) {
      best = { candidate, score };
    }
  };

  const seedExposureStops = clamp(
    getPortraitExposureBiasStops(linearLuminance, 1, size),
    MIN_EXPOSURE_STOPS,
    MAX_EXPOSURE_STOPS,
  );
  const coarseExposureStops = COARSE_EXPOSURE_STOP_OFFSETS.map((offset) =>
    clamp(seedExposureStops + offset, MIN_EXPOSURE_STOPS, MAX_EXPOSURE_STOPS),
  ).filter((stops, index, stopsList) => stopsList.indexOf(stops) === index);

  // Keep the selected scheme. Grayscale palettes posterize under the 1-bit
  // print threshold and beat mono on score without improving a face.
  const colorSchemeCode = baseConfig.colorSchemeCode as AutoTuneColorSchemeCode;

  for (const exposureStops of coarseExposureStops) {
    for (const shadows of COARSE_TONE_STRENGTHS) {
      for (const highlights of COARSE_TONE_STRENGTHS) {
        evaluate({ colorSchemeCode, exposureStops, shadows, highlights });
      }
    }
  }

  if (!best) {
    return {
      colorSchemeCode: ColorScheme.MONO,
      exposure: 1,
      shadows: 0,
      highlights: 0,
    };
  }

  const coarseBest: AutoTuneCandidate = best.candidate;

  // Coordinate descent around the coarse winner, one dimension at a time.
  for (const shadows of buildToneStrengthRange(coarseBest.shadows)) {
    evaluate({ ...best.candidate, shadows });
  }

  for (const highlights of buildToneStrengthRange(coarseBest.highlights)) {
    evaluate({ ...best.candidate, highlights });
  }

  for (const delta of [-REFINE_EXPOSURE_STOP_STEP, REFINE_EXPOSURE_STOP_STEP]) {
    const exposureStops = coarseBest.exposureStops + delta;

    if (
      exposureStops < MIN_EXPOSURE_STOPS ||
      exposureStops > MAX_EXPOSURE_STOPS
    ) {
      continue;
    }

    evaluate({ ...best.candidate, exposureStops });
  }

  const finalCandidate: AutoTuneCandidate = best.candidate;

  return {
    colorSchemeCode: finalCandidate.colorSchemeCode,
    exposure: 2 ** finalCandidate.exposureStops,
    shadows: snap(finalCandidate.shadows, REFINE_TONE_STRENGTH_STEP),
    highlights: snap(finalCandidate.highlights, REFINE_TONE_STRENGTH_STEP),
  };
};

export const autoTuneDitherConfig = async (
  buffer: Buffer<ArrayBuffer>,
  baseConfig: AutoTuneBaseConfig,
): Promise<AutoTuneSearchResult> => {
  const image = await prepareAnalysisImage(buffer);

  return searchBestDitherConfig(image, baseConfig);
};
