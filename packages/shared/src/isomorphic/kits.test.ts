import { describe, expect, test } from "bun:test";

import { DEFAULT_KIT_ID, resolveKitId } from "#isomorphic/kits";

describe("resolveKitId", () => {
  test("keeps a kit this release ships", () => {
    expect(resolveKitId("heirvey")).toEqual({ kitId: "heirvey", known: true });
  });

  test("uses the default kit when the event names none", () => {
    expect(resolveKitId(null)).toEqual({ kitId: DEFAULT_KIT_ID, known: true });
  });

  test("falls back to the default kit for an unknown id", () => {
    expect(resolveKitId("halloween-2099")).toEqual({
      kitId: DEFAULT_KIT_ID,
      known: false,
    });
  });
});
