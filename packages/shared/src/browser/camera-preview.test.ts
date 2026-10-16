import { describe, expect, test } from "bun:test";

import { getPreviewEncoding, orderCodecs } from "#browser/camera-preview";

describe("getPreviewEncoding", () => {
  test("scales the copy down to 480 px on its longest side", () => {
    expect(getPreviewEncoding({ width: 1920, height: 1920 })).toEqual({
      scaleResolutionDownBy: 4,
      maxFramerate: 15,
      maxBitrate: 600_000,
    });
    expect(
      getPreviewEncoding({ width: 1280, height: 720 }).scaleResolutionDownBy,
    ).toBeCloseTo(2.667, 3);
  });

  test("never scales up", () => {
    expect(
      getPreviewEncoding({ width: 320, height: 320 }).scaleResolutionDownBy,
    ).toBe(1);
    expect(getPreviewEncoding({}).scaleResolutionDownBy).toBe(1);
  });
});

describe("orderCodecs", () => {
  test("puts H.264 first and keeps the rest in order", () => {
    const codecs = [
      { mimeType: "video/VP8" },
      { mimeType: "video/H264", sdpFmtpLine: "a" },
      { mimeType: "video/rtx" },
      { mimeType: "video/H264", sdpFmtpLine: "b" },
    ];

    expect(orderCodecs(codecs).map((codec) => codec.mimeType)).toEqual([
      "video/H264",
      "video/H264",
      "video/VP8",
      "video/rtx",
    ]);
    expect(orderCodecs([{ mimeType: "video/VP8" }])).toEqual([
      { mimeType: "video/VP8" },
    ]);
  });
});
