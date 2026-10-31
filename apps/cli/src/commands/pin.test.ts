import { describe, expect, test } from "bun:test";

import { setStaffPinArgs } from "./pin";

describe("setStaffPinArgs", () => {
  test("runs the build's copy on a release, which ships no src/", () => {
    expect(setStaffPinArgs({ release: true })).toEqual([
      "apps/engine/dist/set-staff-pin.js",
    ]);
  });

  test("runs the source on a checkout", () => {
    expect(setStaffPinArgs({ release: false })).toEqual([
      "apps/engine/src/domains/darkroom/darkroom.set-pin.ts",
    ]);
  });
});
