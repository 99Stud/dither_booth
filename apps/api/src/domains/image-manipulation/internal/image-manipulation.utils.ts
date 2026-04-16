import {
  ColorScheme,
  ditherImage as openDisplayDitherImage,
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
  const { data, info } = await sharp(buffer, { failOn: "error" })
    .autoOrient()
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .greyscale()
    .gamma(ditherConfiguration.gamma)
    .linear(ditherConfiguration.contrast, ditherConfiguration.brightness)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgba = Buffer.alloc(info.width * info.height * 4);

  for (
    let src = 0, dst = 0;
    src < data.length;
    src += info.channels, dst += 4
  ) {
    const r = data[src] ?? 0;
    const g = info.channels >= 2 ? (data[src + 1] ?? r) : r;
    const b = info.channels >= 3 ? (data[src + 2] ?? r) : r;
    const a = info.channels >= 4 ? (data[src + 3] ?? 255) : 255;

    rgba[dst] = r;
    rgba[dst + 1] = g;
    rgba[dst + 2] = b;
    rgba[dst + 3] = a;
  }

  return openDisplayDitherImage(
    {
      width: info.width,
      height: info.height,
      data: new Uint8ClampedArray(rgba),
    },
    ColorScheme.MONO,
    ditherConfiguration.ditherModeCode,
  );
};

/**
 * Renders a dithered PaletteImageBuffer into a 1-bit PNG buffer suitable for
 * a preview response. Each pixel is either black (0,0,0) or white (255,255,255).
 */
export const renderDitheredToPng = async (
  dithered: PaletteImageBuffer,
  threshold: number,
) => {
  const { width, height, indices, palette } = dithered;
  const rgb = Buffer.alloc(width * height * 3);

  for (let i = 0; i < indices.length; i++) {
    const black = isPaletteBlack(palette, indices[i]!, threshold);
    const v = black ? 0 : 255;
    rgb[i * 3] = v;
    rgb[i * 3 + 1] = v;
    rgb[i * 3 + 2] = v;
  }

  const png = await sharp(rgb, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();

  return { data: png.toBase64(), mimeType: "image/png" };
};
