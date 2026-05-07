import {
  ditherImage as openDisplayDitherImage,
  type ColorScheme,
  type DitherMode,
  type PaletteImageBuffer,
} from "@opendisplay/epaper-dithering";
import sharp from "sharp";

import type { PrintConfigRow } from "./image-manipulation.types";

/**
 * Maps a palette index to "thermal black" using average RGB < threshold.
 */
export const isPaletteBlack = (
  palette: PaletteImageBuffer["palette"],
  idx: number,
  threshold: number,
) => {
  const c = palette[idx];
  if (!c) {
    return false;
  }
  return (c.r + c.g + c.b) / 3 < threshold;
};

export const rasterBytesFromDithered = (
  dithered: PaletteImageBuffer,
  threshold: number,
): Buffer => {
  const { width, height, indices, palette } = dithered;
  const widthBytes = Math.ceil(width / 8);
  const out = new Uint8Array(widthBytes * height);

  for (let y = 0; y < height; y++) {
    for (let xb = 0; xb < widthBytes; xb++) {
      let byte = 0;
      for (let b = 0; b < 8; b++) {
        const px = xb * 8 + b;
        if (
          px < width &&
          isPaletteBlack(palette, indices[y * width + px]!, threshold)
        ) {
          byte |= 128 >> b;
        }
      }
      out[y * widthBytes + xb] = byte;
    }
  }

  return Buffer.from(out);
};

export const buildGsV0RasterCommand = (
  dithered: PaletteImageBuffer,
  threshold: number,
): Buffer => {
  const widthBytes = Math.ceil(dithered.width / 8);
  const header = Buffer.alloc(8);
  header[0] = 0x1d;
  header[1] = 0x76;
  header[2] = 0x30;
  header[3] = 0x00;
  header.writeUInt16LE(widthBytes, 4);
  header.writeUInt16LE(dithered.height, 6);
  return Buffer.concat([header, rasterBytesFromDithered(dithered, threshold)]);
};

export const ditherImage = async (
  buffer: Buffer<ArrayBuffer>,
  ditherConfiguration: PrintConfigRow,
) => {
  const { data, info } = await sharp(buffer)
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
