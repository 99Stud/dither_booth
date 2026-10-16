import { describe, expect, test } from "bun:test";

import {
  COPY_FIELDS,
  COPY_KEYS,
  fillCopyVariables,
  kitCopyOverridesSchema,
} from "#isomorphic/kit-copy";
import {
  KIT_IDS,
  KIT_MANIFESTS,
  readKitSettings,
  resolveKit,
} from "#isomorphic/kits";

const defaults = KIT_MANIFESTS.tartines.copy;

describe("kit copy defaults", () => {
  test.each([...KIT_IDS])("%s fits every field's limits", (kitId) => {
    const { copy } = KIT_MANIFESTS[kitId];
    for (const key of COPY_KEYS) {
      const field = COPY_FIELDS[key];
      expect(copy[key].length).toBeLessThanOrEqual(field.maxLength);
      if (!("optional" in field)) {
        expect(copy[key].length).toBeGreaterThan(0);
      }
    }
  });
});

describe("readKitSettings and resolveKit", () => {
  test("uses the kit's text when the event changed nothing", () => {
    expect(readKitSettings({})).toEqual({ settings: {}, rejectedKeys: [] });
    expect(readKitSettings(null).settings).toEqual({});
    expect(resolveKit("tartines", {}).copy).toEqual(defaults);
  });

  test("applies the event's edits on top of the kit's text", () => {
    const { settings } = readKitSettings({
      copy: { "landing.start": "Tap to scare", "landing.legalNotice": "" },
    });
    const { copy } = resolveKit("tartines", settings);
    expect(copy["landing.start"]).toBe("Tap to scare");
    expect(copy["landing.legalNotice"]).toBe("");
    expect(copy["prompts.printing"]).toBe(defaults["prompts.printing"]);
  });

  test("drops bad stored values one key at a time", () => {
    const { settings, rejectedKeys } = readKitSettings({
      copy: {
        "landing.start": "x".repeat(200),
        "landing.lotteryTitle": "tombola",
        "landing.removed": "gone",
        "prompts.printing": "",
      },
      background: { id: "from-a-newer-release" },
    });
    expect(settings).toEqual({ copy: { "landing.lotteryTitle": "tombola" } });
    expect(rejectedKeys.toSorted()).toEqual([
      "background",
      "copy.landing.removed",
      "copy.landing.start",
      "copy.prompts.printing",
    ]);
  });
});

describe("kitCopyOverridesSchema", () => {
  test("rejects an unknown key, a required line left empty, or text too long", () => {
    expect(
      kitCopyOverridesSchema.safeParse({ "landing.nope": "x" }).success,
    ).toBe(false);
    expect(
      kitCopyOverridesSchema.safeParse({ "landing.start": "  " }).success,
    ).toBe(false);
    expect(
      kitCopyOverridesSchema.safeParse({ "landing.start": "x".repeat(25) })
        .success,
    ).toBe(false);
  });

  test("trims text and lets an optional line be empty", () => {
    expect(
      kitCopyOverridesSchema.parse({
        "landing.start": "  Go  ",
        "landing.legalNotice": "",
      }),
    ).toEqual({ "landing.start": "Go", "landing.legalNotice": "" });
  });
});

describe("fillCopyVariables", () => {
  test("fills known placeholders and leaves unknown ones as written", () => {
    expect(fillCopyVariables("**{count}** left of {total}", { count: 3 })).toBe(
      "**3** left of {total}",
    );
  });
});
