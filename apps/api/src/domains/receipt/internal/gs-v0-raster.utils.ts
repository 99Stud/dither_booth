import sharp from "sharp";

const GS_V_0_HEADER_SIZE = 8;
const BLACK_PIXEL_BIT_MASKS = Uint8Array.from([
  0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01,
]);

type GrayImage = {
  data: Uint8Array;
  height: number;
  width: number;
};

/**
 * Integer-factor box downscale. Unlike sharp's resampling kernels it maps a
 * block of identical pixels to exactly that value, which is what keeps the
 * pre-dithered photo at pure 0/255 after the 2x screenshot is reduced.
 */
const boxDownscale = (image: GrayImage, factor: number): GrayImage => {
  const width = Math.floor(image.width / factor);
  const height = Math.ceil(image.height / factor);
  const data = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    const rowStart = y * factor;
    const rowEnd = Math.min(rowStart + factor, image.height);

    for (let x = 0; x < width; x++) {
      const columnStart = x * factor;
      let sum = 0;

      for (let sy = rowStart; sy < rowEnd; sy++) {
        const rowOffset = sy * image.width + columnStart;

        for (let sx = 0; sx < factor; sx++) {
          sum += image.data[rowOffset + sx] ?? 255;
        }
      }

      data[y * width + x] = Math.round(sum / ((rowEnd - rowStart) * factor));
    }
  }

  return { data, height, width };
};

const loadGrayImage = async (
  screenshot: Uint8Array,
  targetWidth?: number,
): Promise<GrayImage> => {
  const image = sharp(Buffer.from(screenshot))
    .flatten({ background: "#fff" })
    .grayscale();
  const metadata = await image.metadata();
  const factor =
    targetWidth && metadata.width ? metadata.width / targetWidth : 1;

  if (Number.isInteger(factor) && factor > 1) {
    const { data, info } = await image
      .raw()
      .toBuffer({ resolveWithObject: true });

    return boxDownscale(
      { data, height: info.height, width: info.width },
      factor,
    );
  }

  const { data, info } = await (
    targetWidth
      ? image.resize({ width: targetWidth, withoutEnlargement: true })
      : image
  )
    .raw()
    .toBuffer({ resolveWithObject: true });

  return { data, height: info.height, width: info.width };
};

/**
 * Anything darker than this becomes a printed dot. Kept high so the gray
 * fringe Chromium leaves around a pixel-font stroke joins the stroke as solid
 * black. Error diffusion instead scatters that fringe into dots and makes the
 * letters look ragged. Pixels already at 0 or 255 (the pre-dithered photo)
 * fall on either side of the cutoff, so the photo is unchanged.
 */
const GRAPHICS_BLACK_CUTOFF = 210;

const snapGrayPixels = (image: GrayImage): Uint8Array => {
  const output = new Uint8Array(image.data.length);

  for (let index = 0; index < image.data.length; index++) {
    output[index] = (image.data[index] ?? 255) < GRAPHICS_BLACK_CUTOFF ? 0 : 255;
  }

  return output;
};

export const screenshotToGsV0RasterCommand = async (
  screenshot: Uint8Array,
  options: {
    width?: number;
  } = {},
): Promise<Buffer> => {
  const image = await loadGrayImage(screenshot, options.width);
  const data = snapGrayPixels(image);
  const info = { height: image.height, width: image.width };

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
