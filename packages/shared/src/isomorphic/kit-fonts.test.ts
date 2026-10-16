import { describe, expect, test } from "bun:test";

import {
  fontStack,
  kitFontOverridesSchema,
  readKitFontOverrides,
} from "#isomorphic/kit-fonts";
import { KIT_MANIFESTS, readKitSettings, resolveKit } from "#isomorphic/kits";

describe("fontStack", () => {
  test("tartines keeps the stacks the kiosk always had, bundled", () => {
    const fonts = KIT_MANIFESTS.tartines.fonts;
    expect(fontStack(fonts, "display")).toStartWith(
      '"PPNeueBit", "IBM Plex Sans", ui-monospace',
    );
    expect(fontStack(fonts, "body")).toStartWith('"IBM Plex Sans", ');
    expect(fontStack(fonts, "mono")).toStartWith('"Geist Mono Variable", ');
  });
});

describe("font overrides", () => {
  test("an event swaps a role; the others stay the kit's", () => {
    const { settings } = readKitSettings({ fonts: { display: "creepster" } });
    expect(resolveKit("tartines", settings).fonts).toEqual({
      ...KIT_MANIFESTS.tartines.fonts,
      display: "creepster",
    });
  });

  test("a font this release doesn't ship is dropped, role by role", () => {
    expect(
      readKitFontOverrides({ display: "comic-sans", body: "special-elite" }),
    ).toEqual({
      overrides: { body: "special-elite" },
      rejectedKeys: ["display"],
    });
    expect(
      kitFontOverridesSchema.safeParse({ display: "comic-sans" }).success,
    ).toBe(false);
  });
});
