import { describe, expect, test } from "bun:test";

import { DEFAULT_KIT_ID, resolveKitId } from "#isomorphic/kits";

describe("resolveKitId", () => {
  test("keeps a kit this release ships", () => {
    expect(resolveKitId("tartines")).toEqual({
      kitId: "tartines",
      known: true,
    });
  });

  test("uses the default kit when the event names none", () => {
    expect(resolveKitId(null)).toEqual({ kitId: DEFAULT_KIT_ID, known: true });
  });

  test("falls back to the default kit for an unknown id", () => {
    expect(resolveKitId("halloween-2099")).toEqual({
      kitId: DEFAULT_KIT_ID,
      known: false,
    });
    // A kit since removed from the release, still stored on old events.
    expect(resolveKitId("heirvey")).toEqual({
      kitId: DEFAULT_KIT_ID,
      known: false,
    });
  });
});
