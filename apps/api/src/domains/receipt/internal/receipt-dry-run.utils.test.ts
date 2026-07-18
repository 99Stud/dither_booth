import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

import { screenshotToGsV0RasterCommand } from "./gs-v0-raster.utils";
import { previewReceiptRasters } from "./receipt-dry-run.utils";

async function createMonoRasterCommand() {
  const width = 8;
  const height = 8;
  const pixels = Buffer.alloc(width * height * 3, 255);
  const png = await sharp(pixels, {
    raw: { width, height, channels: 3 },
  })
    .png()
    .toBuffer();

  return await screenshotToGsV0RasterCommand(png, { width });
}

const previewDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    previewDirs
      .splice(0)
      .map((dir) => rm(dir, { force: true, recursive: true })),
  );
});

describe("previewReceiptRasters", () => {
  test("writes photo and lottery PNGs without opening a printer", async () => {
    const previewDir = await mkdtemp(join(tmpdir(), "receipt-dry-run-"));
    previewDirs.push(previewDir);

    const opened: string[][] = [];
    const rasterCmd = await createMonoRasterCommand();

    const result = await previewReceiptRasters({
      lotteryRasterCmd: rasterCmd,
      openPaths: async (paths) => {
        opened.push(paths);
      },
      photoRasterCmd: rasterCmd,
      previewDir,
      ticketRef: "123456",
    });

    expect(result.photoPath).toBe(join(previewDir, "photo-123456.png"));
    expect(result.lotteryPath).toBe(join(previewDir, "lottery-123456.png"));
    expect(opened).toEqual([[result.photoPath, result.lotteryPath]]);

    const [photoBytes, lotteryBytes] = await Promise.all([
      readFile(result.photoPath),
      readFile(result.lotteryPath),
    ]);

    expect(photoBytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(lotteryBytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  test("writes photo PNG only when lottery raster is omitted", async () => {
    const previewDir = await mkdtemp(join(tmpdir(), "receipt-dry-run-"));
    previewDirs.push(previewDir);

    const opened: string[][] = [];
    const rasterCmd = await createMonoRasterCommand();

    const result = await previewReceiptRasters({
      openPaths: async (paths) => {
        opened.push(paths);
      },
      photoRasterCmd: rasterCmd,
      previewDir,
      ticketRef: "654321",
    });

    expect(result.photoPath).toBe(join(previewDir, "photo-654321.png"));
    expect(result.lotteryPath).toBeNull();
    expect(opened).toEqual([[result.photoPath]]);
  });
});
