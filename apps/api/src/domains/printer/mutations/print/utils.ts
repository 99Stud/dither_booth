import { Printer } from "@node-escpos/core";
import type USB from "@node-escpos/usb-adapter";
import {
  ColorScheme,
  DitherMode,
  ditherImage,
  type PaletteImageBuffer,
} from "@opendisplay/epaper-dithering";
import sharp from "sharp";

import type { DitherModeKey, PrintImageInput } from "./schema.ts";

/** TM-T20III, 80mm roll, 203 DPI — printable width 576 dots (standard mode, Epson specs). */
export const PRINT_WIDTH_PX = 576;

const DITHER_MODE_MAP: Record<DitherModeKey, DitherMode> = {
  none: DitherMode.NONE,
  burkes: DitherMode.BURKES,
  ordered: DitherMode.ORDERED,
  "floyd-steinberg": DitherMode.FLOYD_STEINBERG,
  atkinson: DitherMode.ATKINSON,
  stucki: DitherMode.STUCKI,
  sierra: DitherMode.SIERRA,
  "sierra-lite": DitherMode.SIERRA_LITE,
  "jarvis-judice-ninke": DitherMode.JARVIS_JUDICE_NINKE,
};

export const decodeInputToBuffer = (input: Pick<PrintImageInput, "image" | "mimeType">): Buffer => {
  if (input.image.startsWith("data:image/")) {
    const comma = input.image.indexOf(",");
    if (comma === -1) {
      throw new Error("Invalid data URL");
    }
    return Buffer.from(input.image.slice(comma + 1), "base64");
  }
  if (input.mimeType === undefined) {
    throw new Error("mimeType is required when image is raw base64 (not a data URL)");
  }
  return Buffer.from(input.image, "base64");
};

/**
 * Resize + preprocess with Sharp: flatten alpha to white, greyscale, resize to
 * print width, then apply brightness/contrast/gamma adjustments. Returns raw
 * RGBA pixel buffer ready for the dithering step.
 */
export const preprocessImage = async (
  fileBuffer: Buffer,
  opts: Pick<PrintImageInput, "brightness" | "contrast" | "gamma">,
) => {
  let pipeline = sharp(fileBuffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .greyscale()
    .resize(PRINT_WIDTH_PX, null, {
      fit: "inside",
      kernel: sharp.kernel.lanczos3,
    });

  if (opts.gamma !== undefined && opts.gamma !== 1) {
    pipeline = pipeline.gamma(opts.gamma);
  }

  const a = opts.contrast ?? 1;
  const b = opts.brightness ?? 1;
  if (a !== 1 || b !== 1) {
    // linear: output = a * input + b_offset
    // We interpret brightness as an additive shift scaled to [0,255].
    pipeline = pipeline.linear(a, (b - 1) * 128);
  }

  const { data, info } = await pipeline
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgba = Buffer.alloc(info.width * info.height * 4);

  for (let src = 0, dst = 0; src < data.length; src += info.channels, dst += 4) {
    const r = data[src] ?? 0;
    const g = info.channels >= 2 ? (data[src + 1] ?? r) : r;
    const b = info.channels >= 3 ? (data[src + 2] ?? r) : r;
    const a = info.channels >= 4 ? (data[src + 3] ?? 255) : 255;

    rgba[dst] = r;
    rgba[dst + 1] = g;
    rgba[dst + 2] = b;
    rgba[dst + 3] = a;
  }

  return {
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(rgba),
  };
};

export const ditherProcessedImage = (
  imageBuffer: { width: number; height: number; data: Uint8ClampedArray },
  ditherMode: DitherModeKey,
): PaletteImageBuffer => {
  const mode = DITHER_MODE_MAP[ditherMode];
  const dithered = ditherImage(imageBuffer, ColorScheme.MONO, mode);
  return dithered;
};

/**
 * Maps a palette index to "thermal black" using average RGB < threshold.
 */
const isPaletteBlack = (
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
        if (px < width && isPaletteBlack(palette, indices[y * width + px]!, threshold)) {
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

/**
 * Renders a dithered PaletteImageBuffer into a 1-bit PNG buffer suitable for
 * a preview response. Each pixel is either black (0,0,0) or white (255,255,255).
 */
export const renderDitheredToPng = async (
  dithered: PaletteImageBuffer,
  threshold: number,
): Promise<{ data: Buffer; width: number; height: number }> => {
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

  return { data: png, width, height };
};

/**
 * Full pipeline: decode, preprocess, dither, rasterize, send to USB printer.
 */
export const printImageToDevice = async (
  device: USB,
  input: PrintImageInput,
): Promise<void> => {
  const fileBuffer = decodeInputToBuffer(input);
  const imageBuffer = await preprocessImage(fileBuffer, input);
  const dithered = ditherProcessedImage(imageBuffer, input.ditherMode);
  const rasterCmd = buildGsV0RasterCommand(dithered, input.threshold);

  await new Promise<void>((resolve, reject) => {
    device.open((err) => {
      if (err) {
        reject(err);
        return;
      }

      void (async () => {
        const printer = new Printer(device, {
          encoding: "US-ASCII",
        });

        try {
          printer.align("ct");
          printer.raw(rasterCmd);
          printer.feed(2);
          printer.cut();
          await printer.close();
          resolve();
        } catch (e) {
          try {
            await printer.close();
          } catch {
            /* ignore */
          }
          reject(e);
        }
      })();
    });
  });
};
