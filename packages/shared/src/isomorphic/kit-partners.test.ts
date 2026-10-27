import { describe, expect, test } from "bun:test";

import { MAX_PARTNERS, kitPartnersSchema } from "#isomorphic/kit-partners";
import {
  kitSettingsSchema,
  readKitSettings,
  resolveKit,
} from "#isomorphic/kits";

const LOGO_A = "abcdefgh1";
const LOGO_B = "abcdefgh2";

describe("partners", () => {
  test("an event with no partners prints none, whatever its kit", () => {
    expect(resolveKit("tartines", {}).partners).toEqual([]);
    expect(resolveKit("halloween-2026", {}).partners).toEqual([]);
  });

  test("partners keep their order and carry across a change of kit", () => {
    const { settings } = readKitSettings({ partners: [LOGO_B, LOGO_A] });

    expect(resolveKit("tartines", settings).partners).toEqual([LOGO_B, LOGO_A]);
    expect(resolveKit("halloween-2026", settings).partners).toEqual([
      LOGO_B,
      LOGO_A,
    ]);
  });

  test(`saving refuses more than ${MAX_PARTNERS} logos, or one twice`, () => {
    const five = Array.from({ length: 5 }, (_, index) => `abcdefgh${index}`);

    expect(kitPartnersSchema.safeParse(five).success).toBe(false);
    expect(kitPartnersSchema.safeParse([LOGO_A, LOGO_A]).success).toBe(false);
    expect(kitPartnersSchema.safeParse(["../etc"]).success).toBe(false);
    expect(
      kitSettingsSchema.safeParse({ partners: [LOGO_A, LOGO_B] }).success,
    ).toBe(true);
  });

  test("stored partners this release can't read are dropped and named", () => {
    expect(readKitSettings({ partners: "nope" })).toEqual({
      settings: {},
      rejectedKeys: ["partners"],
    });
  });
});
