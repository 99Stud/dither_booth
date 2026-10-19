import { describe, expect, test } from "bun:test";

import { frameRasterJob, GS_A_OFF, GS_A_ON } from "./printer.escpos";

const RASTER = Buffer.from([
  0x1d, 0x76, 0x30, 0x00, 0x01, 0x00, 0x02, 0x00, 0xff, 0x10, 0x04, 0x01,
]);

/**
 * What `@node-escpos/core` 0.6.0 sent for one receipt before the printer
 * watch: ESC @, align("ct"), the raster, feed(2), cut() (feed 3, GS V 0).
 * Captured from the library before it was removed.
 */
const NODE_ESCPOS_FRAMING = (raster: Buffer) =>
  ["1b40", "1b6101", raster.toString("hex"), "0a0a", "0a0a0a1d5600"].join("");

describe("frameRasterJob", () => {
  test("without ASB, sends exactly what node-escpos sent", () => {
    expect(frameRasterJob(RASTER, { asb: false }).toString("hex")).toBe(
      NODE_ESCPOS_FRAMING(RASTER),
    );
  });

  test("with ASB, turns status back on right after ESC @", () => {
    expect(frameRasterJob(RASTER, { asb: true }).toString("hex")).toBe(
      [
        "1b40", // ESC @
        "1d61ff", // GS a 0xFF
        "1b6101", // ESC a 1
        RASTER.toString("hex"),
        "0a0a", // feed(2)
        "0a0a0a1d5600", // cut(): feed 3, GS V 0
      ].join(""),
    );
  });

  test("names the ASB switches", () => {
    expect(GS_A_ON.toString("hex")).toBe("1d61ff");
    expect(GS_A_OFF.toString("hex")).toBe("1d6100");
  });
});
