import { describe, expect, test } from "bun:test";

import { gsV0ToGraphicsBands } from "./graphics-band.utils";

const gsV0 = (widthBytes: number, rows: number[][]) =>
  Buffer.from([
    0x1d,
    0x76,
    0x30,
    0x00,
    widthBytes,
    0,
    rows.length,
    0,
    ...rows.flat(),
  ]);

/** One band exactly as Epson's rastertotmtr _WriteBand writes it. */
// oxfmt-ignore
const epsonBand = (widthDots: number, data: number[]) => {
  const rows = data.length / (widthDots / 8);
  const length = data.length + 10;

  return [
    // ESC $ 0 0
    0x1b, 0x24, 0x00, 0x00,
    // GS 8 L p1..p4 m fn a bx by c xL xH yL yH
    0x1d, 0x38, 0x4c,
    length & 0xff, (length >> 8) & 0xff, (length >> 16) & 0xff, length >>> 24,
    0x30, 0x70, 0x30, 0x01, 0x01, 0x31,
    widthDots & 0xff, widthDots >> 8, rows & 0xff, rows >> 8,
    ...data,
    // GS ( L fn 50
    0x1d, 0x28, 0x4c, 0x02, 0x00, 0x30, 0x32,
  ];
};

describe("gsV0ToGraphicsBands", () => {
  test("wraps a short raster in a single GS 8 L band", () => {
    const command = gsV0(2, [
      [0xff, 0x00],
      [0x0f, 0xf0],
    ]);

    expect([...gsV0ToGraphicsBands(command)]).toEqual(
      epsonBand(16, [0xff, 0x00, 0x0f, 0xf0]),
    );
  });

  test("splits rows into bands of the requested height", () => {
    const command = gsV0(1, [[0x01], [0x02], [0x03]]);

    expect([...gsV0ToGraphicsBands(command, 2)]).toEqual([
      ...epsonBand(8, [0x01, 0x02]),
      ...epsonBand(8, [0x03]),
    ]);
  });

  test("rejects anything that is not GS v 0", () => {
    expect(() => gsV0ToGraphicsBands(Buffer.from([0x1b, 0x40]))).toThrow(
      "Invalid GS v 0 raster command header.",
    );
  });
});
