import { describe, expect, test } from "bun:test";

import { getUnlockErrorMessage } from "./Darkroom.utils";

describe("getUnlockErrorMessage", () => {
  test("explains each refusal from the engine", () => {
    expect(getUnlockErrorMessage("UNAUTHORIZED", "Wrong PIN.")).toBe(
      "Wrong PIN.",
    );
    expect(getUnlockErrorMessage("TOO_MANY_REQUESTS", "x")).toContain(
      "Wait a few minutes",
    );
    expect(getUnlockErrorMessage("BAD_REQUEST", "x")).toBe(
      "The PIN is 4 to 8 digits.",
    );
  });

  test("falls back to a network message", () => {
    expect(getUnlockErrorMessage(undefined, undefined)).toContain(
      "Couldn't reach",
    );
  });
});
