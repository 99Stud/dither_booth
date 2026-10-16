import { describe, expect, test } from "bun:test";

import {
  applyBackgroundControls,
  BACKGROUND_CONTROLS,
  backgroundSettingsSchema,
  readBackgroundSettings,
  type BackgroundControl,
} from "#isomorphic/background-controls";
import {
  BACKGROUND_IDS,
  BACKGROUND_PRESETS,
  type BackgroundPreset,
} from "#isomorphic/backgrounds";
import { KIT_IDS, KIT_MANIFESTS, resolveKit } from "#isomorphic/kits";

/** Every numeric leaf of a preset, keyed by its dotted path. */
function numericLeaves(preset: BackgroundPreset): Map<string, number> {
  const leaves = new Map<string, number>();
  const walk = (node: unknown, path: string) => {
    if (typeof node === "number") leaves.set(path, node);
    else if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        walk(value, path ? `${path}.${key}` : key);
      }
    }
  };
  walk(preset, "");
  return leaves;
}

const bases = [
  ...BACKGROUND_IDS.map((id) => [id, BACKGROUND_PRESETS[id]] as const),
  ...KIT_IDS.map((id) => [`kit ${id}`, KIT_MANIFESTS[id].background] as const),
];

describe("applyBackgroundControls", () => {
  test.each(bases)("%s: no changes keeps the look exactly", (_, base) => {
    expect(applyBackgroundControls(base, {})).toEqual(base);

    const allAtDefault = Object.fromEntries(
      Object.entries(BACKGROUND_CONTROLS[base.effect].controls)
        .filter(([, control]) => control.kind === "slider")
        .map(([key]) => [key, 50]),
    );
    expect(applyBackgroundControls(base, allAtDefault)).toEqual(base);
  });

  test.each(bases)(
    "%s: each slider moves only its own values, within their range, at both ends",
    (_, base) => {
      const before = numericLeaves(base);
      const controls: Record<string, BackgroundControl> =
        BACKGROUND_CONTROLS[base.effect].controls;

      for (const [key, control] of Object.entries(controls)) {
        if (control.kind !== "slider") continue;
        const own = new Set(
          control.params.map((param) => param.path.join(".")),
        );

        for (const position of [0, 100]) {
          const after = numericLeaves(
            applyBackgroundControls(base, { [key]: position }),
          );
          for (const param of control.params) {
            const path = param.path.join(".");
            expect(before.has(path)).toBe(true);
            const value = after.get(path)!;
            expect(value).toBeGreaterThanOrEqual(param.min);
            expect(value).toBeLessThanOrEqual(param.max);
          }
          for (const [path, value] of after) {
            if (!own.has(path)) expect(value).toBe(before.get(path)!);
          }
        }

        // The two ends really differ, or the slider does nothing.
        const low = applyBackgroundControls(base, { [key]: 0 });
        const high = applyBackgroundControls(base, { [key]: 100 });
        expect(low).not.toEqual(high);
      }
    },
  );

  test("switches turn post passes on and off; colours repaint", () => {
    const base = BACKGROUND_PRESETS.smoke;
    const next = applyBackgroundControls(base, {
      scanlines: false,
      crt: true,
      paperInk: ["#e8e0cf", "#1c1a17"],
    });
    expect(next.passes).toMatchObject({ scanlines: false, crt: true });
    expect(next.effect === "smoke" && next.settings.smoke).toMatchObject({
      paperColor: "#e8e0cf",
      inkColor: "#1c1a17",
    });
    // The base is never mutated.
    expect(base.passes.scanlines).toBe(true);
  });

  test("a fluid palette builds the whole ramp from three colours", () => {
    const next = applyBackgroundControls(BACKGROUND_PRESETS.fluid, {
      palette: ["#1f0500", "#8a1c00", "#ff7a1a"],
    });
    expect(next.effect === "fluid" && next.settings.turbulence.palette).toEqual(
      [
        "#000000",
        "#1f0500",
        "#8a1c00",
        "#ff7a1a",
        expect.stringMatching(/^#[0-9a-f]{6}$/u),
        expect.stringMatching(/^#[0-9a-f]{6}$/u),
      ],
    );
  });
});

describe("looks", () => {
  test.each([...BACKGROUND_IDS])("%s: every look is a valid setting", (id) => {
    const { looks } = BACKGROUND_CONTROLS[id];
    expect(looks[0]?.values).toEqual({});
    for (const look of looks) {
      const parsed = backgroundSettingsSchema.safeParse({
        id,
        look: look.id,
        values: look.values,
      });
      expect(parsed.success).toBe(true);
    }
  });
});

describe("readBackgroundSettings", () => {
  test("keeps known controls and drops the rest, key by key", () => {
    const { settings, rejectedKeys } = readBackgroundSettings({
      id: "smoke",
      look: "fog",
      values: {
        amount: 30,
        swirl: 300,
        grain: "lots",
        paperInk: ["#e8e0cf"],
        fromTheFuture: 1,
        crt: true,
      },
    });
    expect(settings).toEqual({
      id: "smoke",
      look: "fog",
      values: { amount: 30, crt: true },
    });
    expect(rejectedKeys.toSorted()).toEqual([
      "background.values.fromTheFuture",
      "background.values.grain",
      "background.values.paperInk",
      "background.values.swirl",
    ]);
  });

  test("an unknown shader is dropped whole, and the save schema refuses it", () => {
    expect(readBackgroundSettings({ id: "lava" })).toEqual({
      settings: undefined,
      rejectedKeys: ["background"],
    });
    expect(
      backgroundSettingsSchema.safeParse({
        id: "smoke",
        values: { swirl: 300 },
      }).success,
    ).toBe(false);
  });
});

describe("resolveKit background and camera", () => {
  test("tartines renders today's shader and camera CRT", () => {
    const kit = resolveKit("tartines", {});
    expect(kit.background).toEqual(BACKGROUND_PRESETS.fluid);
    // The CRT's blue was hard-coded as the fluid highlight, #3edbff.
    expect(kit.camera).toEqual({
      crtLines: true,
      wash: true,
      tint: "#3edbff",
      strength: 50,
    });
  });

  test("switching shader starts from that shader's own look", () => {
    const kit = resolveKit("tartines", {
      background: { id: "smoke", values: { amount: 70 } },
      camera: { wash: false, tint: "#ff0000" },
    });
    expect(kit.background.effect).toBe("smoke");
    expect(kit.camera).toMatchObject({ wash: false, tint: "#ff0000" });
  });
});
