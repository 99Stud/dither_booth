import { describe, expect, test } from "bun:test";
import sharp, { type Sharp } from "sharp";

import type { PrintConfigRow } from "#domains/print-configuration/print-configuration.service";

import { DITHER_MODE_BLUE_NOISE } from "#domains/print-configuration/print-configuration.service";

import { ditherImage } from "./image-manipulation.utils";
import { blueNoiseDither, buildToneLut } from "./ordered-dither";

const BLUE_NOISE_CONFIGURATION: PrintConfigRow = {
  id: 1,
  ditherModeCode: DITHER_MODE_BLUE_NOISE,
  colorSchemeCode: 0,
  serpentine: true,
  exposure: 1,
  saturation: 1,
  shadows: 0,
  highlights: 0,
  toneGamma: 1.8,
  threshold: 128,
  rotation: 0,
  template: "tartines",
};

const WIDTH = 96;
const HEIGHT = 16;

const grayRamp = () =>
  Uint8Array.from({ length: WIDTH * HEIGHT }, (_, index) =>
    Math.round(((index % WIDTH) / (WIDTH - 1)) * 255),
  );

const rampPng = async () =>
  await sharp(grayRamp(), {
    raw: { width: WIDTH, height: HEIGHT, channels: 1 },
  })
    .png()
    .toBuffer();

const readGray = async (image: Sharp) =>
  (await image.grayscale().raw().toBuffer()).values().toArray();

describe("ditherImage in blue-noise mode", () => {
  test("thresholds the photo's gray against the blue-noise mask", async () => {
    const dithered = await ditherImage(
      await rampPng(),
      BLUE_NOISE_CONFIGURATION,
    );

    expect(await readGray(dithered)).toEqual(
      Array.from(blueNoiseDither(grayRamp(), WIDTH, HEIGHT)),
    );
  });

  test("applies exposure and tone gamma from the configuration", async () => {
    const configuration = {
      ...BLUE_NOISE_CONFIGURATION,
      exposure: 2,
      toneGamma: 2.2,
    };
    const dithered = await ditherImage(await rampPng(), configuration);

    expect(await readGray(dithered)).toEqual(
      Array.from(
        blueNoiseDither(
          grayRamp(),
          WIDTH,
          HEIGHT,
          buildToneLut({ exposure: 2, gamma: 2.2 }),
        ),
      ),
    );
  });

  test("returns an opaque RGBA image like the library modes", async () => {
    const dithered = await ditherImage(
      await rampPng(),
      BLUE_NOISE_CONFIGURATION,
    );
    const { info } = await dithered.raw().toBuffer({ resolveWithObject: true });

    expect(info).toMatchObject({ width: WIDTH, height: HEIGHT, channels: 4 });
  });
});
