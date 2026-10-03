import { ColorScheme, type ImageBuffer } from "@opendisplay/epaper-dithering";
import { describe, expect, test } from "bun:test";
import sharp from "sharp";

import { COLOR_SCHEME_CODE_OPTIONS } from "#domains/print-configuration/internal/print-configuration.constants";

import {
  autoTuneDitherConfig,
  buildTarget,
  prepareScoreTarget,
  renderCandidate,
  scoreCandidate,
  searchBestDitherConfig,
  type AutoTuneBaseConfig,
} from "./auto-tune-search.utils";

const BASE_CONFIG: AutoTuneBaseConfig = {
  colorSchemeCode: ColorScheme.MONO,
  ditherModeCode: 1,
  serpentine: true,
  saturation: 1,
  threshold: 128,
};

const SIZE = 96;

const createGradientImage = (
  low: number,
  high: number,
  size = SIZE,
): ImageBuffer => {
  const data = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * (size - 1));
      const value = Math.round(low + (high - low) * t);
      const offset = (y * size + x) * 4;

      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }

  return { data, width: size, height: size };
};

const createPortraitImage = (size = SIZE): ImageBuffer => {
  const data = new Uint8ClampedArray(size * size * 4);
  const center = (size - 1) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fromCenter = Math.hypot(x - center, y - center) / size;
      const inEye =
        Math.hypot(x - center - size * 0.08, y - center + size * 0.04) <
          size * 0.035 ||
        Math.hypot(x - center + size * 0.08, y - center + size * 0.04) <
          size * 0.035;
      const value = inEye ? 70 : fromCenter < 0.38 ? 160 : 28;
      const offset = (y * size + x) * 4;

      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }

  return { data, width: size, height: size };
};

const createHighContrastTexturedImage = (size = SIZE): ImageBuffer => {
  const data = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const isLeftHalf = x < size / 2;
      const texture = ((x >> 2) + (y >> 2)) % 2 === 0 ? 0 : 25;
      const value = isLeftHalf ? texture : 230 + texture;
      const offset = (y * size + x) * 4;

      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }

  return { data, width: size, height: size };
};

const createGradientPng = async (low: number, high: number) => {
  const image = createGradientImage(low, high, 288);

  return Buffer.from(
    await sharp(Buffer.from(image.data.buffer), {
      raw: { width: image.width, height: image.height, channels: 4 },
    })
      .png()
      .toBuffer(),
  );
};

const expectWithinSchemaBounds = (result: {
  colorSchemeCode: number;
  exposure: number;
  highlights: number;
  shadows: number;
}) => {
  expect(result.exposure).toBeGreaterThanOrEqual(0.25);
  expect(result.exposure).toBeLessThanOrEqual(4);
  expect(result.shadows).toBeGreaterThanOrEqual(0);
  expect(result.shadows).toBeLessThanOrEqual(1);
  expect(result.highlights).toBeGreaterThanOrEqual(0);
  expect(result.highlights).toBeLessThanOrEqual(1);
  expect(COLOR_SCHEME_CODE_OPTIONS).toContain(result.colorSchemeCode);
};

describe("searchBestDitherConfig", () => {
  test("brightens a dark scene", () => {
    const result = searchBestDitherConfig(
      createGradientImage(0, 70),
      BASE_CONFIG,
    );

    expect(result.exposure).toBeGreaterThan(1);
    expectWithinSchemaBounds(result);
  });

  test("does not brighten an already bright scene", () => {
    const result = searchBestDitherConfig(
      createGradientImage(190, 255),
      BASE_CONFIG,
    );

    expect(result.exposure).toBeLessThanOrEqual(1);
    expect(result.highlights).toBeGreaterThan(0);
    expectWithinSchemaBounds(result);
  });

  test("brightens a midtone face and keeps the dark surround down", () => {
    const result = searchBestDitherConfig(createPortraitImage(), BASE_CONFIG);

    expect(result.exposure).toBeGreaterThan(1);
    expect(result.shadows).toBeLessThanOrEqual(0.25);
    expectWithinSchemaBounds(result);
  });

  test("does not lift shadows on an already separated scene", () => {
    const result = searchBestDitherConfig(
      createHighContrastTexturedImage(),
      BASE_CONFIG,
    );

    expect(result.shadows).toBeLessThanOrEqual(0.25);
    expectWithinSchemaBounds(result);
  });

  test("snaps tone strengths to the slider step", () => {
    const result = searchBestDitherConfig(
      createHighContrastTexturedImage(),
      BASE_CONFIG,
    );

    expect(Math.round(result.shadows * 20) / 20).toBe(result.shadows);
    expect(Math.round(result.highlights * 20) / 20).toBe(result.highlights);
  });
});

describe("buildTarget", () => {
  test("lifts the face and pushes features toward black", () => {
    const image = createPortraitImage();
    const linear = new Float32Array(image.width * image.height);

    for (let i = 0; i < linear.length; i++) {
      const value = (image.data[i * 4] ?? 0) / 255;
      linear[i] =
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }

    const target = buildTarget(linear, 1, {
      width: image.width,
      height: image.height,
    });
    const center = Math.floor(image.width / 2);
    const face = target[center * image.width + center] ?? 0;
    const eye =
      target[
        Math.round(center - image.width * 0.04) * image.width +
          Math.round(center - image.width * 0.08)
      ] ?? 0;
    const corner = target[0] ?? 0;

    expect(face).toBeGreaterThan(0.8);
    expect(eye).toBeLessThan(0.35);
    expect(corner).toBeLessThan(0.15);
  });
});

describe("scoreCandidate", () => {
  test("scores a faithful render lower than an inverted one", () => {
    const image = createGradientImage(0, 255);
    const rendered = renderCandidate(image, BASE_CONFIG, {
      colorSchemeCode: ColorScheme.MONO,
      exposureStops: 0,
      shadows: 0,
      highlights: 0,
    });
    const inverted = {
      ...rendered,
      data: rendered.data.map((value) => 1 - value),
    };
    const target = prepareScoreTarget({
      data: Float32Array.from(
        { length: image.width * image.height },
        (_, i) => (image.data[i * 4] ?? 0) / 255,
      ),
      width: image.width,
      height: image.height,
    });

    expect(scoreCandidate(rendered, target)).toBeLessThan(
      scoreCandidate(inverted, target),
    );
  });
});

describe("autoTuneDitherConfig", () => {
  test("runs the full search at analysis resolution within budget", async () => {
    const png = await createGradientPng(20, 120);
    const startedAt = performance.now();
    const result = await autoTuneDitherConfig(png, BASE_CONFIG);
    const elapsedMs = performance.now() - startedAt;

    expectWithinSchemaBounds(result);
    expect(result.exposure).toBeGreaterThan(1);
    expect(elapsedMs).toBeLessThan(3000);
  });
});
