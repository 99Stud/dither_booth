import { describe, expect, test } from "bun:test";

import {
  DARKROOM_HOTSPOT_TAPS,
  DARKROOM_HOTSPOT_WINDOW_MS,
} from "./Experience.constants";
import { registerDarkroomTap } from "./Experience.darkroom";

const tapAt = (times: number[]) => {
  let taps: number[] = [];
  const opened: boolean[] = [];

  for (const time of times) {
    const result = registerDarkroomTap(taps, time);
    taps = result.taps;
    opened.push(result.opens);
  }

  return opened;
};

describe("registerDarkroomTap", () => {
  test("opens on the 4th quick tap, not before", () => {
    expect(DARKROOM_HOTSPOT_TAPS).toBe(4);
    expect(tapAt([0, 300, 600, 900])).toEqual([false, false, false, true]);
  });

  test("taps spread over more than the window don't open", () => {
    const slow = DARKROOM_HOTSPOT_WINDOW_MS / 2;

    expect(tapAt([0, slow, slow * 2, slow * 3])).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  test("counting starts over after it opens", () => {
    expect(tapAt([0, 100, 200, 300, 400, 500, 600])).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
  });
});
