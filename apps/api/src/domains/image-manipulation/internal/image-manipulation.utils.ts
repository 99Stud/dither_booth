import {
  ditherImage as openDisplayDitherImage,
  type ColorScheme,
  type DitherMode,
} from "@opendisplay/epaper-dithering";
import sharp from "sharp";

import type { PrintConfigRow } from "./image-manipulation.types";

interface DitherImageOptions {
  width?: number;
  withoutEnlargement?: boolean;
}

const GS_V_0_HEADER_SIZE = 8;
const BLACK_PIXEL_BIT_MASKS = Uint8Array.from([
  0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01,
]);

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

export const screenshotToGsV0RasterCommand = async (
  screenshot: Uint8Array,
  options: {
    threshold?: number;
    width?: number;
  } = {},
): Promise<Buffer> => {
  const threshold = options.threshold ?? 128;

  let image = sharp(Buffer.from(screenshot))
    .flatten({ background: "#fff" })
    .grayscale();

  if (options.width) {
    image = image.resize({ width: options.width, withoutEnlargement: true });
  }

  const { data, info } = await image
    .threshold(threshold)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const widthBytes = Math.ceil(info.width / 8);
  const command = Buffer.allocUnsafe(
    GS_V_0_HEADER_SIZE + widthBytes * info.height,
  );

  command[0] = 0x1d; // GS
  command[1] = 0x76; // v
  command[2] = 0x30; // 0
  command[3] = 0x00; // normal density
  command.writeUInt16LE(widthBytes, 4);
  command.writeUInt16LE(info.height, 6);

  for (let y = 0; y < info.height; y++) {
    const sourceRowOffset = y * info.width;
    const targetRowOffset = GS_V_0_HEADER_SIZE + y * widthBytes;

    for (let xb = 0; xb < widthBytes; xb++) {
      let byte = 0;
      const sourceByteOffset = sourceRowOffset + xb * 8;
      const bitsInByte = Math.min(8, info.width - xb * 8);

      for (let bit = 0; bit < bitsInByte; bit++) {
        const pixel = data[sourceByteOffset + bit];

        // After threshold(), 0 is black and 255 is white.
        if (pixel === 0) {
          byte |= BLACK_PIXEL_BIT_MASKS[bit] ?? 0;
        }
      }

      command[targetRowOffset + xb] = byte;
    }
  }

  return command;
};

export const gsV0RasterCommandToPngBuffer = async (
  command: Buffer,
): Promise<Buffer> => {
  if (command.length < GS_V_0_HEADER_SIZE) {
    throw new Error("GS v 0 raster command is too short.");
  }

  if (command[0] !== 0x1d || command[1] !== 0x76 || command[2] !== 0x30) {
    throw new Error("Invalid GS v 0 raster command header.");
  }

  const widthBytes = command.readUInt16LE(4);
  const height = command.readUInt16LE(6);
  const width = widthBytes * 8;
  const expectedLength = GS_V_0_HEADER_SIZE + widthBytes * height;

  if (command.length < expectedLength) {
    throw new Error("GS v 0 raster command payload is truncated.");
  }

  const pixels = Buffer.alloc(width * height);

  for (let y = 0; y < height; y++) {
    const targetRowOffset = y * width;
    const sourceRowOffset = GS_V_0_HEADER_SIZE + y * widthBytes;

    for (let xb = 0; xb < widthBytes; xb++) {
      const byte = command[sourceRowOffset + xb] ?? 0;

      for (let bit = 0; bit < 8; bit++) {
        const mask = BLACK_PIXEL_BIT_MASKS[bit] ?? 0;
        pixels[targetRowOffset + xb * 8 + bit] = byte & mask ? 0 : 255;
      }
    }
  }

  return await sharp(pixels, {
    raw: { width, height, channels: 1 },
  })
    .png()
    .toBuffer();
};
