import {
  ditherImage as openDisplayDitherImage,
  type ColorScheme,
  type DitherMode,
} from "@opendisplay/epaper-dithering";
import sharp from "sharp";

import type { PrintConfigRow } from "#domains/print-configuration/print-configuration.service";

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

  if (options.width) {
    image = image.resize({
      width: options.width,
      withoutEnlargement: options.withoutEnlargement ?? true,
    });
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
