import { describe, expect, test } from "bun:test";

import type { PrinterFault } from "./printer.types";

import { createAsbParser, decodeAsb } from "./printer.asb";

const hex = (value: string) => Buffer.from(value.replaceAll(" ", ""), "hex");

describe("decodeAsb", () => {
  // Packets recorded on the booth's TM-T20III on 2026-10-19.
  test.each<[string, PrinterFault[], boolean]>([
    ["14 00 00 0f", [], false],
    ["3c 00 00 0f", ["cover-open"], true],
    ["5c 00 00 0f", [], true],
    ["1c 00 0c 0f", ["paper-out"], true],
    ["3c 00 0c 0f", ["paper-out", "cover-open"], true],
  ])("%s", (packet, conditions, offline) => {
    expect(decodeAsb(hex(packet))).toEqual({ conditions, offline });
  });

  test("reads paper near end from byte 3 bits 0-1", () => {
    expect(decodeAsb(hex("14 00 03 0f")).conditions).toEqual([
      "paper-near-end",
    ]);
  });

  test("reads cutter, unrecoverable and auto-recoverable errors as error", () => {
    for (const byte2 of ["08", "20", "40"]) {
      expect(decodeAsb(hex(`14 ${byte2} 00 0f`)).conditions).toEqual(["error"]);
    }
  });
});

describe("createAsbParser", () => {
  test("cuts consecutive packets from one read", () => {
    const parser = createAsbParser();

    expect(parser.push(hex("14 00 00 0f 3c 00 00 0f"))).toEqual([
      hex("14 00 00 0f"),
      hex("3c 00 00 0f"),
    ]);
  });

  test("joins a packet split across reads", () => {
    const parser = createAsbParser();

    expect(parser.push(hex("1c 00"))).toEqual([]);
    expect(parser.push(hex("0c 0f"))).toEqual([hex("1c 00 0c 0f")]);
  });

  test("skips real-time status replies mixed in", () => {
    const parser = createAsbParser();

    expect(parser.push(hex("12 14 00 16 00 0f 12"))).toEqual([
      hex("14 00 00 0f"),
    ]);
  });

  test("drops a partial packet when a new one starts", () => {
    const parser = createAsbParser();

    expect(parser.push(hex("3c 00 14 00 00 0f"))).toEqual([hex("14 00 00 0f")]);
  });

  test("ignores stray bytes outside a packet", () => {
    const parser = createAsbParser();

    expect(parser.push(hex("00 0f 14 00 00 0f"))).toEqual([hex("14 00 00 0f")]);
  });

  test("starts clean after a reset", () => {
    const parser = createAsbParser();

    parser.push(hex("3c 00"));
    parser.reset();

    expect(parser.push(hex("00 0f"))).toEqual([]);
  });
});
