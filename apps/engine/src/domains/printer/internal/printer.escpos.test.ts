import { describe, expect, test } from "bun:test";

import {
  buildTextTicket,
  framePrintJob,
  GS_A_OFF,
  GS_A_ON,
} from "./printer.escpos";

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

describe("framePrintJob", () => {
  test("without ASB, sends exactly what node-escpos sent", () => {
    expect(framePrintJob(RASTER, { asb: false }).toString("hex")).toBe(
      NODE_ESCPOS_FRAMING(RASTER),
    );
  });

  test("with ASB, turns status back on right after ESC @", () => {
    expect(framePrintJob(RASTER, { asb: true }).toString("hex")).toBe(
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

describe("framePrintJob with ESC/POS content", () => {
  test("passes the text ticket through untouched between the framing", () => {
    const body = buildTextTicket([{ kind: "text", text: "hi" }]);

    expect(
      framePrintJob(body, { asb: false, content: "escpos" }).toString("hex"),
    ).toBe(NODE_ESCPOS_FRAMING(body));
  });
});

describe("buildTextTicket", () => {
  test("prints a QR with GS ( k model 2, error correction M", () => {
    const hex = buildTextTicket([{ kind: "qr", data: "http://a" }]).toString(
      "hex",
    );

    expect(hex).toBe(
      [
        "1d286b0400314132" + "00", // model 2
        "1d286b0300314308", // module size 8
        "1d286b0300314531", // error correction M
        "1d286b0b00315030", // store 8 bytes + 3
        Buffer.from("http://a").toString("hex"),
        "1d286b0300315130", // print
        "0a",
      ].join(""),
    );
  });

  test("drops accents and replaces what the code page can't print", () => {
    const hex = buildTextTicket([{ kind: "text", text: "Café → ok" }]).toString(
      "hex",
    );

    expect(Buffer.from(hex, "hex").toString("latin1")).toBe("Cafe ? ok\n");
  });

  test("refuses QR data the printer can't store", () => {
    expect(() =>
      buildTextTicket([{ kind: "qr", data: "x".repeat(7090) }]),
    ).toThrow();
  });
});
