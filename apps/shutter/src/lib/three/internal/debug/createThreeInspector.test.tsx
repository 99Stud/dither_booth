import { describe, expect, test } from "bun:test";

import { isThreeDebugEnabled } from "./createThreeInspector";

describe("isThreeDebugEnabled", () => {
  test("is off unless the URL has ?debug", () => {
    expect(isThreeDebugEnabled("")).toBe(false);
    expect(isThreeDebugEnabled("?foo=1")).toBe(false);
    expect(isThreeDebugEnabled("?debug")).toBe(true);
    expect(isThreeDebugEnabled("?foo=1&debug=1")).toBe(true);
  });
});
