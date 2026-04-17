import type { PrintConfigRow } from "#domains/image-manipulation/internal/image-manipulation.types.ts";
import type USB from "@node-escpos/usb-adapter";

import {
  buildGsV0RasterCommand,
  ditherImage,
} from "#domains/image-manipulation/internal/image-manipulation.utils.ts";
import { PRINT_WIDTH_PX } from "#domains/image-manipulation/internal/image-manipulation.constants.ts";
import { API_PRINTER_LOG_SOURCE } from "#lib/printer/printer.constants.ts";
import { logKioskEvent } from "@dither-booth/logging";
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
  const totalStart = performance.now();
  const { metrics, rasterCmd } = await imageToRasterCommand(input, ditherConfiguration);
  const usbOpenCallAt = performance.now();

  await new Promise<void>((resolve, reject) => {
    device.open((err) => {
      const usbOpenMs = roundDuration(performance.now() - usbOpenCallAt);
      if (err) {
        reject(err);
        return;
      }

      void (async () => {
        const usbOpsStart = performance.now();
        const printer = new Printer(device, {
          encoding: "US-ASCII",
        });

        try {
          printer.align("ct");
          printer.raw(rasterCmd);
          printer.feed(2);
          printer.cut();
          await printer.close();
          logKioskEvent("info", API_PRINTER_LOG_SOURCE, "print-image-complete", {
            details: {
              ...metrics,
              totalMs: roundDuration(performance.now() - totalStart),
              usbOpenMs,
              usbPrintOpsMs: roundDuration(performance.now() - usbOpsStart),
            },
          });
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
  const totalStart = performance.now();
  const rasterCommands = await Promise.all(
    images.map(async (img, index) => {
      const result = await imageToRasterCommand(
        img.buffer,
        img.ditherConfiguration,
      );

      logKioskEvent("info", API_PRINTER_LOG_SOURCE, "print-sequence-raster-command-built", {
        details: {
          imageIndex: index,
          ...result.metrics,
        },
      });

      return result.rasterCmd;
    }),
  );
  const usbOpenCallAt = performance.now();

  await new Promise<void>((resolve, reject) => {
    device.open((err) => {
      const usbOpenMs = roundDuration(performance.now() - usbOpenCallAt);
      if (err) {
        reject(err);
        return;
      }

      void (async () => {
        const usbOpsStart = performance.now();
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
          logKioskEvent("info", API_PRINTER_LOG_SOURCE, "print-sequence-complete", {
            details: {
              imageCount: rasterCommands.length,
              totalMs: roundDuration(performance.now() - totalStart),
              usbOpenMs,
              usbPrintOpsMs: roundDuration(performance.now() - usbOpsStart),
            },
          });
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
): Promise<{
  metrics: {
    ditherHeight: number;
    ditherMs: number;
    ditherWidth: number;
    inputBytes: number;
    rasterBytes: number;
    rasterizeMs: number;
    resizeMs: number;
    resizedBytes: number;
    totalMs: number;
  };
  rasterCmd: Buffer;
}> => {
  const totalStart = performance.now();
  const resizeStart = performance.now();
  const sizedForRoll = await sharp(input)
    .resize({
      width: PRINT_WIDTH_PX,
      withoutEnlargement: true,
    })
    .toBuffer();
  const resizeMs = performance.now() - resizeStart;

  const ditherStart = performance.now();
  const dithered = await ditherImage(
    sizedForRoll as Parameters<typeof ditherImage>[0],
    ditherConfiguration,
  );
  const ditherMs = performance.now() - ditherStart;

  const rasterizeStart = performance.now();
  const rasterCmd = buildGsV0RasterCommand(dithered, ditherConfiguration.threshold);
  const rasterizeMs = performance.now() - rasterizeStart;

  return {
    metrics: {
      ditherHeight: dithered.height,
      ditherMs: roundDuration(ditherMs),
      ditherWidth: dithered.width,
      inputBytes: input.byteLength,
      rasterBytes: rasterCmd.byteLength,
      rasterizeMs: roundDuration(rasterizeMs),
      resizeMs: roundDuration(resizeMs),
      resizedBytes: sizedForRoll.byteLength,
      totalMs: roundDuration(performance.now() - totalStart),
    },
    rasterCmd,
  };
};

const roundDuration = (value: number) => {
  return Math.round(value * 100) / 100;
};
