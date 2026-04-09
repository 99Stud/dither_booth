import { describe, expect, it } from "bun:test";

import {
  appendTerminalLine,
  createInitialSignalSeries,
  getNextSyncValue,
  getSignalValue,
  getTerminalLine,
  shiftSignalSeries,
} from "./SplashHud.utils.ts";

describe("getNextSyncValue", () => {
  it("keeps the sync value in a high-attention nominal band", () => {
    const values = [0, 400, 1200, 2600, 4800].map((elapsedMs) =>
      getNextSyncValue(elapsedMs),
    );

    expect(values.some((value) => value !== values[0])).toBe(true);

    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(94);
      expect(value).toBeLessThanOrEqual(100);
    }
  });
});

describe("signal series helpers", () => {
  it("creates a fixed-length signal series", () => {
    const points = createInitialSignalSeries(6);

    expect(points).toEqual([
      { index: 0, value: getSignalValue(0) },
      { index: 1, value: getSignalValue(1) },
      { index: 2, value: getSignalValue(2) },
      { index: 3, value: getSignalValue(3) },
      { index: 4, value: getSignalValue(4) },
      { index: 5, value: getSignalValue(5) },
    ]);
  });

  it("shifts the series left and appends the next point", () => {
    const shifted = shiftSignalSeries(createInitialSignalSeries(4), 4);

    expect(shifted).toEqual([
      { index: 1, value: getSignalValue(1) },
      { index: 2, value: getSignalValue(2) },
      { index: 3, value: getSignalValue(3) },
      { index: 4, value: getSignalValue(4) },
    ]);
  });
});

describe("terminal helpers", () => {
  it("generates themed terminal lines", () => {
    expect(getTerminalLine(0)).toContain("99STUD");
    expect(getTerminalLine(5)).toContain("SYNC");
  });

  it("keeps only the newest terminal rows", () => {
    const lines = appendTerminalLine(
      ["a", "b", "c", "d"],
      getTerminalLine(4),
      4,
    );

    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("b");
    expect(lines.at(-1)).toBe(getTerminalLine(4));
  });
});
