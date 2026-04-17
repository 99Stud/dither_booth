import { describe, expect, it } from "bun:test";
import sharp from "sharp";

import type { PrintConfigRow } from "./image-manipulation.types.ts";
import { ditherImage } from "./image-manipulation.utils.ts";

const TEST_PRINT_CONFIG: PrintConfigRow = {
  id: 1,
  ditherModeCode: 2,
  brightness: 1,
  contrast: 1,
  gamma: 1,
  threshold: 128,
  namesEntryEnabled: false,
};

const createExifRotatedJpeg = async () => {
  return await sharp(
    Buffer.from([
      0, 0, 0, 255, 255, 255,
    ]),
    {
      raw: {
        width: 2,
        height: 1,
        channels: 3,
      },
    },
  )
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
};

describe("ditherImage", () => {
  it("auto-orients JPEGs using EXIF orientation metadata", async () => {
    const rotatedJpeg = await createExifRotatedJpeg();

    const dithered = await ditherImage(
      rotatedJpeg as Buffer<ArrayBuffer>,
      TEST_PRINT_CONFIG,
    );

    expect(dithered.width).toBe(1);
    expect(dithered.height).toBe(2);
  });
});
