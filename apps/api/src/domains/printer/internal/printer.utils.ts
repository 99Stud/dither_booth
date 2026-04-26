import type { PrintConfigRow } from "#domains/image-manipulation/internal/image-manipulation.types";
import type USB from "@node-escpos/usb-adapter";

import {
  buildGsV0RasterCommand,
  ditherImage,
} from "#domains/image-manipulation/internal/image-manipulation.utils";
import { Printer } from "@node-escpos/core";

/**
 * Full pipeline: decode, preprocess, dither, rasterize, send to USB printer.
 */
export const printImageToDevice = async (
  device: USB,
  input: Buffer<ArrayBuffer>,
  ditherConfiguration: PrintConfigRow,
): Promise<void> => {
  const dithered = await ditherImage(input, ditherConfiguration);
  const rasterCmd = buildGsV0RasterCommand(
    dithered,
    ditherConfiguration.threshold,
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
