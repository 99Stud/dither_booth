import type { PrintConfigRow } from "#domains/image-manipulation/internal/image-manipulation.types.ts";
import type USB from "@node-escpos/usb-adapter";

import {
  buildGsV0RasterCommand,
  ditherImage,
} from "#domains/image-manipulation/internal/image-manipulation.utils.ts";
import { PRINT_WIDTH_PX } from "#domains/image-manipulation/internal/image-manipulation.constants.ts";
import { Printer } from "@node-escpos/core";
import sharp from "sharp";

/**
 * Full pipeline: decode, preprocess, dither, rasterize, send to USB printer.
 */
export const printImageToDevice = async (
  device: USB,
  input: Buffer<ArrayBuffer>,
  ditherConfiguration: PrintConfigRow,
): Promise<void> => {
  const rasterCmd = await imageToRasterCommand(input, ditherConfiguration);

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

/**
 * Print multiple images in sequence, cutting between each.
 * Used for classic receipt + lottery outcome ticket.
 */
export const printImageSequenceToDevice = async (
  device: USB,
  images: Array<{ buffer: Buffer<ArrayBuffer>; ditherConfiguration: PrintConfigRow }>,
): Promise<void> => {
  const rasterCommands = await Promise.all(
    images.map((img) =>
      imageToRasterCommand(img.buffer, img.ditherConfiguration),
    ),
  );

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
          for (const rasterCmd of rasterCommands) {
            printer.align("ct");
            printer.raw(rasterCmd);
            printer.feed(2);
            printer.cut();
          }
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

const imageToRasterCommand = async (
  input: Buffer<ArrayBuffer>,
  ditherConfiguration: PrintConfigRow,
): Promise<Buffer> => {
  const sizedForRoll = await sharp(input)
    .resize({
      width: PRINT_WIDTH_PX,
      withoutEnlargement: true,
    })
    .toBuffer();

  const dithered = await ditherImage(
    sizedForRoll as Parameters<typeof ditherImage>[0],
    ditherConfiguration,
  );

  return buildGsV0RasterCommand(dithered, ditherConfiguration.threshold);
};
