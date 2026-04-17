import { describe, expect, it } from "bun:test";

import {
  getJpegImageMetadata,
  shouldManuallyOrientBitmap,
} from "./image-orientation.utils.ts";

const JPEG_WITH_ORIENTATION_6 = Uint8Array.from([
  0xff, 0xd8,
  0xff, 0xe1, 0x00, 0x22,
  0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
  0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
  0x00, 0x01,
  0x01, 0x12,
  0x00, 0x03,
  0x00, 0x00, 0x00, 0x01,
  0x00, 0x06, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0xff, 0xc0, 0x00, 0x11,
  0x08,
  0x00, 0x01,
  0x00, 0x02,
  0x03,
  0x01, 0x11, 0x00,
  0x02, 0x11, 0x00,
  0x03, 0x11, 0x00,
  0xff, 0xd9,
]);

describe("getJpegImageMetadata", () => {
  it("reads EXIF orientation and encoded dimensions from JPEG bytes", () => {
    expect(getJpegImageMetadata(JPEG_WITH_ORIENTATION_6)).toEqual({
      height: 1,
      orientation: 6,
      width: 2,
    });
  });
});

describe("shouldManuallyOrientBitmap", () => {
  it("requires manual rotation when decoded dimensions still match encoded JPEG dimensions", () => {
    expect(
      shouldManuallyOrientBitmap({
        bitmapHeight: 1,
        bitmapWidth: 2,
        jpegMetadata: {
          height: 1,
          orientation: 6,
          width: 2,
        },
      }),
    ).toBe(true);
  });

  it("skips manual rotation when the browser already swapped width and height", () => {
    expect(
      shouldManuallyOrientBitmap({
        bitmapHeight: 2,
        bitmapWidth: 1,
        jpegMetadata: {
          height: 1,
          orientation: 6,
          width: 2,
        },
      }),
    ).toBe(false);
  });
});
