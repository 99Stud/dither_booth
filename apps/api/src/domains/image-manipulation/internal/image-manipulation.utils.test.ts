import { describe, expect, test } from "bun:test";
import sharp from "sharp";

import {
  gsV0RasterCommandToPngBuffer,
  screenshotToGsV0RasterCommand,
} from "./image-manipulation.utils";

async function createPngFromMonoPixels({
  height,
  pixels,
  width,
}: {
  height: number;
  pixels: Array<0 | 255>;
  width: number;
}) {
  const data = Buffer.alloc(width * height * 3);

  for (let index = 0; index < pixels.length; index++) {
    const value = pixels[index] ?? 255;
    const offset = index * 3;

    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
  }

  return await sharp(data, {
    raw: { width, height, channels: 3 },
  })
    .png()
    .toBuffer();
}

async function readMonoPixelsFromPng(
  png: Buffer,
  _width: number,
  _height: number,
) {
  const { data } = await sharp(png)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return [...data];
}

describe("screenshotToGsV0RasterCommand", () => {
  test("packs an all-white 8px-wide image as an empty raster byte", async () => {
    const screenshot = await createPngFromMonoPixels({
      height: 1,
      pixels: [255, 255, 255, 255, 255, 255, 255, 255],
      width: 8,
    });

    const command = await screenshotToGsV0RasterCommand(screenshot);

    expect([...command]).toEqual([0x1d, 0x76, 0x30, 0x00, 1, 0, 1, 0, 0x00]);
  });

  test("packs an all-black 8px-wide image as a full raster byte", async () => {
    const screenshot = await createPngFromMonoPixels({
      height: 1,
      pixels: [0, 0, 0, 0, 0, 0, 0, 0],
      width: 8,
    });

    const command = await screenshotToGsV0RasterCommand(screenshot);

    expect([...command]).toEqual([0x1d, 0x76, 0x30, 0x00, 1, 0, 1, 0, 0xff]);
  });

  test("pads trailing bits as white for non-byte-aligned widths", async () => {
    const screenshot = await createPngFromMonoPixels({
      height: 1,
      pixels: [0, 255, 0, 255, 0, 255, 0, 255, 0],
      width: 9,
    });

    const command = await screenshotToGsV0RasterCommand(screenshot);

    expect([...command]).toEqual([
      0x1d, 0x76, 0x30, 0x00, 2, 0, 1, 0, 0xaa, 0x80,
    ]);
  });

  test("writes width bytes and height as little-endian header values", async () => {
    const screenshot = await createPngFromMonoPixels({
      height: 2,
      pixels: Array.from({ length: 18 }, () => 255),
      width: 9,
    });

    const command = await screenshotToGsV0RasterCommand(screenshot);

    expect(command.subarray(0, 8).toJSON().data).toEqual([
      0x1d, 0x76, 0x30, 0x00, 2, 0, 2, 0,
    ]);
  });
});

describe("gsV0RasterCommandToPngBuffer", () => {
  test("unpacks an all-black 8px-wide raster byte", async () => {
    const command = Buffer.from([0x1d, 0x76, 0x30, 0x00, 1, 0, 1, 0, 0xff]);
    const png = await gsV0RasterCommandToPngBuffer(command);

    expect(await readMonoPixelsFromPng(png, 8, 1)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });

  test("unpacks an all-white 8px-wide raster byte", async () => {
    const command = Buffer.from([0x1d, 0x76, 0x30, 0x00, 1, 0, 1, 0, 0x00]);
    const png = await gsV0RasterCommandToPngBuffer(command);

    expect(await readMonoPixelsFromPng(png, 8, 1)).toEqual([
      255, 255, 255, 255, 255, 255, 255, 255,
    ]);
  });

  test("round-trips byte-aligned screenshots through GS v 0", async () => {
    const screenshot = await createPngFromMonoPixels({
      height: 1,
      pixels: [0, 255, 0, 255, 0, 255, 0, 255],
      width: 8,
    });

    const command = await screenshotToGsV0RasterCommand(screenshot);
    const png = await gsV0RasterCommandToPngBuffer(command);
    const roundTripped = await screenshotToGsV0RasterCommand(png);

    expect([...roundTripped]).toEqual([...command]);
  });

  test("rejects truncated GS v 0 commands", async () => {
    await expect(
      gsV0RasterCommandToPngBuffer(Buffer.from([0x1d, 0x76, 0x30, 0x00])),
    ).rejects.toThrow("too short");
  });
});
