import { describe, expect, test } from "bun:test";
import sharp from "sharp";

import { analyzePhotoTone, getAutoToneSettings } from "./auto-tune.utils";

const createSolidPng = async (value: number) =>
  Buffer.from(
    await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: { r: value, g: value, b: value },
      },
    })
      .png()
      .toBuffer(),
  );

const createSplitPixels = (low: number, high: number) => {
  const pixels = new Uint8Array(100 * 3);
  pixels.fill(low, 0, 150);
  pixels.fill(high, 150);
  return pixels;
};

describe("getAutoToneSettings", () => {
  test("leaves a middle grey scene untouched", async () => {
    expect(await analyzePhotoTone(await createSolidPng(118))).toEqual({
      exposure: 1,
      shadows: 0,
      highlights: 0,
    });
  });

  test("brightens a dim scene", async () => {
    const settings = await analyzePhotoTone(await createSolidPng(40));

    expect(settings.exposure).toBeGreaterThan(1);
    expect(settings.shadows).toBe(0);
  });

  test("darkens an overexposed scene", async () => {
    const settings = await analyzePhotoTone(await createSolidPng(230));

    expect(settings.exposure).toBeLessThan(1);
    expect(settings.highlights).toBe(0);
  });

  test("clamps exposure to the slider range", async () => {
    expect((await analyzePhotoTone(await createSolidPng(2))).exposure).toBe(4);
    expect((await analyzePhotoTone(await createSolidPng(255))).exposure).toBe(
      0.25,
    );
  });

  test("lifts shadows and compresses highlights on a high contrast scene", () => {
    const settings = getAutoToneSettings(createSplitPixels(0, 255), 3);

    expect(settings.shadows).toBe(1);
    expect(settings.highlights).toBe(1);
  });

  test("returns neutral settings for an empty image", () => {
    expect(getAutoToneSettings(new Uint8Array(), 3)).toEqual({
      exposure: 1,
      shadows: 0,
      highlights: 0,
    });
  });
});
