import { logKioskEvent } from "@dither-booth/logging";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { API_APP_ROOT } from "#lib/constants";
import { API_PRINTER_LOG_SOURCE } from "#lib/printer/printer.constants";

import { gsV0RasterCommandToPngBuffer } from "./gs-v0-raster.utils";

export const DEFAULT_RECEIPT_PREVIEW_DIR = join(
  API_APP_ROOT,
  "tmp",
  "receipt-previews",
);

export async function openPreviewPaths(paths: string[]): Promise<void> {
  if (paths.length === 0) {
    return;
  }

  if (process.platform === "darwin") {
    const exitCode = await Bun.spawn(["open", ...paths], {
      stdout: "ignore",
      stderr: "ignore",
    }).exited;

    if (exitCode !== 0) {
      throw new Error(`Failed to open receipt previews (exit ${exitCode}).`);
    }

    return;
  }

  if (process.platform === "linux") {
    for (const path of paths) {
      const exitCode = await Bun.spawn(["xdg-open", path], {
        stdout: "ignore",
        stderr: "ignore",
      }).exited;

      if (exitCode !== 0) {
        throw new Error(
          `Failed to open receipt preview ${path} (exit ${exitCode}).`,
        );
      }
    }
  }
}

export async function previewReceiptRasters({
  lotteryRasterCmd,
  openPaths = openPreviewPaths,
  photoRasterCmd,
  previewDir = DEFAULT_RECEIPT_PREVIEW_DIR,
  ticketRef,
}: {
  lotteryRasterCmd: Buffer;
  openPaths?: (paths: string[]) => Promise<void>;
  photoRasterCmd: Buffer;
  previewDir?: string;
  ticketRef: string;
}): Promise<{ lotteryPath: string; photoPath: string }> {
  await mkdir(previewDir, { recursive: true });

  const [photoPng, lotteryPng] = await Promise.all([
    gsV0RasterCommandToPngBuffer(photoRasterCmd),
    gsV0RasterCommandToPngBuffer(lotteryRasterCmd),
  ]);

  const photoPath = join(previewDir, `photo-${ticketRef}.png`);
  const lotteryPath = join(previewDir, `lottery-${ticketRef}.png`);

  await Promise.all([
    Bun.write(photoPath, photoPng),
    Bun.write(lotteryPath, lotteryPng),
  ]);

  await openPaths([photoPath, lotteryPath]);

  logKioskEvent("info", API_PRINTER_LOG_SOURCE, "receipt-print-dry-run", {
    details: {
      lotteryPath,
      photoPath,
      ticketRef,
    },
  });

  return { lotteryPath, photoPath };
}
