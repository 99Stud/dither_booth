import sharp from "sharp";

const ANALYSIS_SIZE_PX = 128;
const LOG_LUMINANCE_EPSILON = 1e-4;
// Linear 0.18 is photographic middle grey (~46% sRGB).
const TARGET_KEY_LUMINANCE = 0.18;
const EXPOSURE_STOP_STEP = 0.5;
const MIN_EXPOSURE_STOPS = -2;
const MAX_EXPOSURE_STOPS = 2;
const SHADOW_CLIP_SRGB = 0.1;
const HIGHLIGHT_CLIP_SRGB = 0.9;
// Clipped share tolerated before correcting, and share at which correction maxes out.
const CLIP_DEAD_ZONE = 0.02;
const CLIP_FULL_STRENGTH = 0.25;
const TONE_STRENGTH_STEP = 0.05;

export interface AutoToneSettings {
  exposure: number;
  highlights: number;
  shadows: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const snap = (value: number, step: number) =>
  Number((Math.round(value / step) * step).toFixed(4));

const srgbToLinear = (value: number) =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

const linearToSrgb = (value: number) =>
  value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;

const getClipStrength = (clippedShare: number) =>
  snap(
    clamp((clippedShare - CLIP_DEAD_ZONE) / CLIP_FULL_STRENGTH, 0, 1),
    TONE_STRENGTH_STEP,
  );

export const getAutoToneSettings = (
  pixels: Uint8Array,
  channels: number,
): AutoToneSettings => {
  const pixelCount = Math.floor(pixels.length / channels);

  if (pixelCount === 0) {
    return { exposure: 1, shadows: 0, highlights: 0 };
  }

  const luminances = new Float64Array(pixelCount);
  let logLuminanceSum = 0;

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * channels;
    const r = srgbToLinear((pixels[offset] ?? 0) / 255);
    const g = srgbToLinear((pixels[offset + 1] ?? 0) / 255);
    const b = srgbToLinear((pixels[offset + 2] ?? 0) / 255);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    luminances[i] = luminance;
    logLuminanceSum += Math.log(LOG_LUMINANCE_EPSILON + luminance);
  }

  const keyLuminance = Math.exp(logLuminanceSum / pixelCount);
  const exposureStops = clamp(
    snap(Math.log2(TARGET_KEY_LUMINANCE / keyLuminance), EXPOSURE_STOP_STEP),
    MIN_EXPOSURE_STOPS,
    MAX_EXPOSURE_STOPS,
  );
  const exposure = 2 ** exposureStops;

  let shadowCount = 0;
  let highlightCount = 0;

  for (const luminance of luminances) {
    const exposed = linearToSrgb(Math.min(1, luminance * exposure));

    if (exposed < SHADOW_CLIP_SRGB) {
      shadowCount++;
    } else if (exposed > HIGHLIGHT_CLIP_SRGB) {
      highlightCount++;
    }
  }

  return {
    exposure,
    shadows: getClipStrength(shadowCount / pixelCount),
    highlights: getClipStrength(highlightCount / pixelCount),
  };
};

export const analyzePhotoTone = async (buffer: Buffer<ArrayBuffer>) => {
  const { data, info } = await sharp(buffer)
    .resize({
      width: ANALYSIS_SIZE_PX,
      height: ANALYSIS_SIZE_PX,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#fff" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return getAutoToneSettings(data, info.channels);
};
