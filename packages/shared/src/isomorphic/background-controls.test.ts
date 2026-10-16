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

describe("halloween-2026", () => {
  // Merlin's values from #18, confirmed by the user on 2026-10-16.
  test("renders #18's charcoal smoke with Merlin's values, camera CRT off", () => {
    const kit = resolveKit("halloween-2026", {});
    expect(kit.background).toEqual({
      effect: "smoke",
      settings: {
        simulation: {
          simRes: 128,
          dyeRes: 512,
          iterations: 2,
          idleFrames: 240,
          densityDissipation: 0.98,
          velocityDissipation: 0.913,
          pressureDissipation: 0.99,
          curlStrength: 8.5,
          splatRadius: 0.3,
        },
        smoke: {
          fieldScale: 0.35,
          scale: 1.66,
          speed: 0.08,
          drift: [0.17, 0.6],
          warp: 1.94,
          turbulence: 0.85,
          lacunarity: 1.42,
          gain: 0.38,
          rise: 0.25,
          fluidStrength: 0.0063,
          threshold: 0.33,
          softness: 0.15,
          smudge: 0.33,
          haze: 0.34,
          grit: 0.85,
          grain: 0.31,
          grainSize: 1.5,
          grainFps: 8,
          edgeWidth: 6.2,
          edgeStrength: 17.5,
          fresnelPower: 0.65,
          edgeGrain: 1.53,
          dotSize: 3.5,
          dotDensity: 0.32,
          dust: 0.017,
          paperColor: "#a8a59f",
          inkColor: "#333333",
          paperTooth: 0.125,
        },
      },
      postProcessing: {
        ascii: {
          cellSize: 4,
          invert: 1,
          color: 1,
          charBrightness: 1.99,
          backgroundBrightness: 0.56,
          smoothness: 0.1,
        },
        bloom: { strength: 0.5, radius: 0.35, threshold: 0.12 },
        film: { strength: 0.32 },
        scanlines: { thickness: 9.2, intensity: 0.42, speed: 1, focus: 4.1 },
      },
      passes: {
        ascii: true,
        bloom: true,
        crt: false,
        film: true,
        scanlines: true,
      },
    });
    expect(kit.camera).toMatchObject({ crtLines: false, wash: false });
    expect(kit.copy).toEqual(KIT_MANIFESTS.tartines.copy);
    expect(kit.fonts).toEqual(KIT_MANIFESTS.tartines.fonts);
  });
});
