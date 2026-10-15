import {
  ditherImage as openDisplayDitherImage,
  type ColorScheme,
  type DitherMode,
} from "@opendisplay/epaper-dithering";
import sharp, { type Sharp } from "sharp";

import type { PrintConfigRow } from "#domains/print-configuration/print-configuration.service";

import { DITHER_MODE_BLUE_NOISE } from "#domains/print-configuration/print-configuration.service";

import { blueNoiseDither, buildToneLut } from "./ordered-dither";

interface DitherImageOptions {
  width?: number;
  withoutEnlargement?: boolean;
}

export const ditherImage = async (
  buffer: Buffer<ArrayBuffer>,
  ditherConfiguration: PrintConfigRow,
  options: DitherImageOptions = {},
) => {
  let image = sharp(buffer);

  if (ditherConfiguration.rotation !== 0) {
    image = image.rotate(ditherConfiguration.rotation, {
      background: "#fff",
    });
  }

  if (options.width) {
    image = image.resize({
      width: options.width,
      withoutEnlargement: options.withoutEnlargement ?? true,
    });
  }

  if (ditherConfiguration.ditherModeCode === DITHER_MODE_BLUE_NOISE) {
    return await blueNoiseDitherImage(image, ditherConfiguration);
  }

  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const dithered = openDisplayDitherImage(
    {
      width: info.width,
      height: info.height,
      data: new Uint8ClampedArray(data),
    },
    ditherConfiguration.colorSchemeCode as ColorScheme,
    {
      mode: ditherConfiguration.ditherModeCode as DitherMode,
      serpentine: ditherConfiguration.serpentine,
      exposure: ditherConfiguration.exposure,
      saturation: ditherConfiguration.saturation,
      shadows: ditherConfiguration.shadows,
      highlights: ditherConfiguration.highlights,
    },
  );

  const rgbaBuffer = Buffer.alloc(dithered.width * dithered.height * 4);
  for (let i = 0; i < dithered.indices.length; i++) {
    const index = dithered.indices[i];

    if (index !== undefined) {
      const c = dithered.palette[index];

      if (c === undefined) {
        continue;
      }

      rgbaBuffer[i * 4] = c.r;
      rgbaBuffer[i * 4 + 1] = c.g;
      rgbaBuffer[i * 4 + 2] = c.b;
      rgbaBuffer[i * 4 + 3] = 255;
    }
  }

  return sharp(rgbaBuffer, {
    raw: { width: dithered.width, height: dithered.height, channels: 4 },
  });
};

/**
 * Reproduces macOS printing to the TM-T20III: gray re-encoded at gamma 1.8,
 * then thresholded against a 64x64 blue-noise mask. Saturation, shadows,
 * highlights, serpentine and the color scheme do not apply.
 */
const blueNoiseDitherImage = async (
  image: Sharp,
  ditherConfiguration: PrintConfigRow,
) => {
  const { data, info } = await image
    .flatten({ background: "#fff" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const dots = blueNoiseDither(
    data,
    info.width,
    info.height,
    buildToneLut({
      exposure: ditherConfiguration.exposure,
      gamma: ditherConfiguration.toneGamma,
    }),
  );

  return sharp(dots, {
    raw: { width: info.width, height: info.height, channels: 1 },
  })
    .toColourspace("srgb")
    .ensureAlpha();
};
