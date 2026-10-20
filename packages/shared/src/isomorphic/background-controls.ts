import z from "zod";

import {
  BACKGROUND_IDS,
  cloneBackgroundPreset,
  type BackgroundId,
  type BackgroundPreset,
  type PostPassKey,
} from "#isomorphic/backgrounds";

/**
 * The shader settings staff edit in admin. They never see raw shader values
 * ("lacunarity", "fresnel power"): each background offers a few controls in
 * plain words, and each control moves several raw values at once around the
 * kit's own look. Raw values stay in code and in the `?debug` inspector.
 */

/** Where a raw value lives in a `BackgroundPreset`, e.g. `settings.smoke.warp`. */
type ParamPath = readonly (string | number)[];

type ScaledParam = {
  path: ParamPath;
  /**
   * How far the ends move the value: at 100 it is multiplied by `factor`, at 0
   * divided by it, at 50 it is the kit's own. Below 1, the slider runs the
   * other way.
   */
  factor: number;
  /** The raw value's safe range, which also keeps the iPad's frame rate. */
  min: number;
  max: number;
  /**
   * Scale the distance to 1 instead of the value: for dissipations, where
   * 0.98 versus 0.99 halves how long a trail lasts.
   */
  complement?: boolean;
  integer?: boolean;
};

export type SliderControl = {
  kind: "slider";
  label: string;
  help: string;
  ends: [low: string, high: string];
  params: ScaledParam[];
};

export type SwitchControl = {
  kind: "switch";
  label: string;
  help: string;
  pass: PostPassKey;
};

export type ColorSwatch = { id: string; label: string; colors: string[] };

export type ColorsControl = {
  kind: "colors";
  label: string;
  help: string;
  /** One label per colour well, e.g. Paper and Ink. */
  slots: string[];
  swatches: ColorSwatch[];
  read: (preset: BackgroundPreset) => string[];
  write: (preset: BackgroundPreset, colors: string[]) => void;
};

export type BackgroundControl = SliderControl | SwitchControl | ColorsControl;

export type ControlValue = number | boolean | string[];

/** Control values by key; a missing key keeps the kit's own look. */
export type BackgroundControlValues = Record<string, ControlValue>;

export type BackgroundLook = {
  id: string;
  label: string;
  values: BackgroundControlValues;
};

export type BackgroundControls = {
  groups: { label: string; keys: string[] }[];
  controls: Record<string, BackgroundControl>;
  /** One-click starting points. The first is the background's own look. */
  looks: BackgroundLook[];
};

export const SLIDER_DEFAULT = 50;

const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/iu);

const hexToRgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const rgbToHex = (rgb: number[]) =>
  `#${rgb
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

/** `amount` of the way from `hex` to white. */
const lighten = (hex: string, amount: number) =>
  rgbToHex(hexToRgb(hex).map((c) => c + (255 - c) * amount));

const retroSwitches: Record<string, SwitchControl> = {
  ascii: {
    kind: "switch",
    label: "Ascii screen",
    help: "Draws the background as text characters.",
    pass: "ascii",
  },
  scanlines: {
    kind: "switch",
    label: "Scanlines",
    help: "Moving lines, like an old monitor.",
    pass: "scanlines",
  },
  film: {
    kind: "switch",
    label: "Film grain",
    help: "A light flicker of noise over everything.",
    pass: "film",
  },
  crt: {
    kind: "switch",
    label: "CRT curve",
    help: "Bends and darkens the edges like a tube screen.",
    pass: "crt",
  },
};

const touchParams = (fluidStrength: ScaledParam["path"], max: number) => [
  { path: fluidStrength, factor: 4, min: 0, max },
  {
    path: ["settings", "simulation", "splatRadius"],
    factor: 2,
    min: 0.05,
    max: 1,
  },
  {
    path: ["settings", "simulation", "curlStrength"],
    factor: 2,
    min: 0,
    max: 40,
  },
];

const FLUID_CONTROLS: BackgroundControls = {
  groups: [
    { label: "Colours", keys: ["palette"] },
    { label: "Feel", keys: ["flowSpeed", "trail", "glow"] },
    { label: "Texture", keys: ["characterSize"] },
    { label: "Touch", keys: ["touch"] },
    { label: "Retro effects", keys: ["ascii", "scanlines", "film", "crt"] },
  ],
  controls: {
    palette: {
      kind: "colors",
      label: "Palette",
      help: "From the darkest folds to the brightest swirls.",
      slots: ["Shadow", "Middle", "Highlight"],
      swatches: [
        {
          id: "deep-sea",
          label: "Deep sea",
          colors: ["#021820", "#0a5f7a", "#3edbff"],
        },
        {
          id: "neon",
          label: "Neon",
          colors: ["#14002b", "#7a1fff", "#ff3df2"],
        },
        {
          id: "ember",
          label: "Ember",
          colors: ["#1f0500", "#8a1c00", "#ff7a1a"],
        },
        {
          id: "toxic",
          label: "Toxic",
          colors: ["#041a06", "#1f7a12", "#9cff57"],
        },
        {
          id: "mono",
          label: "Mono",
          colors: ["#111111", "#555555", "#e6e6e6"],
        },
      ],
      read: (preset) =>
        preset.effect === "fluid"
          ? preset.settings.turbulence.palette.slice(1, 4)
          : [],
      write: (preset, [shadow, middle, highlight]) => {
        if (preset.effect !== "fluid" || !shadow || !middle || !highlight)
          return;
        preset.settings.turbulence.palette = [
          "#000000",
          shadow,
          middle,
          highlight,
          lighten(highlight, 0.35),
          lighten(highlight, 0.75),
        ];
      },
    },
    flowSpeed: {
      kind: "slider",
      label: "Flow speed",
      help: "How fast the colours drift when nobody touches the screen.",
      ends: ["Calm", "Lively"],
      params: [
        {
          path: ["settings", "turbulence", "overallSpeed"],
          factor: 3,
          min: 0,
          max: 1,
        },
        {
          path: ["settings", "turbulence", "sinSpeed"],
          factor: 3,
          min: 0,
          max: 1,
        },
      ],
    },
    trail: {
      kind: "slider",
      label: "Trail",
      help: "How long a finger's swirl stays on screen.",
      ends: ["Short", "Long"],
      params: [
        {
          path: ["settings", "simulation", "densityDissipation"],
          factor: 0.3,
          min: 0.9,
          max: 0.998,
          complement: true,
        },
        {
          path: ["settings", "simulation", "velocityDissipation"],
          factor: 0.5,
          min: 0.8,
          max: 0.99,
          complement: true,
        },
      ],
    },
    glow: {
      kind: "slider",
      label: "Glow",
      help: "The halo around the brightest parts.",
      ends: ["Soft", "Strong"],
      params: [
        {
          path: ["postProcessing", "bloom", "strength"],
          factor: 3,
          min: 0,
          max: 3,
        },
      ],
    },
    characterSize: {
      kind: "slider",
      label: "Character size",
      help: "The size of the ascii characters, when the ascii screen is on.",
      ends: ["Fine", "Chunky"],
      params: [
        {
          path: ["postProcessing", "ascii", "cellSize"],
          factor: 2.5,
          min: 4,
          max: 64,
          integer: true,
        },
      ],
    },
    touch: {
      kind: "slider",
      label: "Touch reaction",
      help: "How much the background follows a finger. Drag on the preview to try it.",
      ends: ["Subtle", "Strong"],
      params: touchParams(["settings", "turbulence", "fluidStrength"], 0.005),
    },
    ...retroSwitches,
  },
  looks: [
    { id: "deep-sea", label: "Deep sea", values: {} },
    {
      id: "neon",
      label: "Neon",
      values: {
        palette: ["#14002b", "#7a1fff", "#ff3df2"],
        flowSpeed: 70,
        glow: 75,
      },
    },
    {
      id: "ember",
      label: "Ember",
      values: {
        palette: ["#1f0500", "#8a1c00", "#ff7a1a"],
        flowSpeed: 35,
        trail: 70,
      },
    },
  ],
};

const SMOKE_CONTROLS: BackgroundControls = {
  groups: [
    { label: "Colours", keys: ["paperInk"] },
    { label: "Feel", keys: ["amount", "drift", "swirl"] },
    { label: "Texture", keys: ["grain", "edges"] },
    { label: "Touch", keys: ["touch"] },
    { label: "Retro effects", keys: ["ascii", "scanlines", "film", "crt"] },
  ],
  controls: {
    paperInk: {
      kind: "colors",
      label: "Paper and ink",
      help: "The paper behind the smoke and the charcoal it is drawn with.",
      slots: ["Paper", "Ink"],
      swatches: [
        { id: "charcoal", label: "Charcoal", colors: ["#a8a59f", "#333333"] },
        { id: "bone", label: "Bone", colors: ["#e8e0cf", "#1c1a17"] },
        { id: "blood", label: "Blood", colors: ["#2a0608", "#c21f1f"] },
        { id: "toxic", label: "Toxic", colors: ["#0e1a0c", "#9cff57"] },
        { id: "night", label: "Night", colors: ["#0b0b14", "#c9c3e6"] },
      ],
      read: (preset) =>
        preset.effect === "smoke"
          ? [preset.settings.smoke.paperColor, preset.settings.smoke.inkColor]
          : [],
      write: (preset, [paper, ink]) => {
        if (preset.effect !== "smoke" || !paper || !ink) return;
        preset.settings.smoke.paperColor = paper;
        preset.settings.smoke.inkColor = ink;
      },
    },
    amount: {
      kind: "slider",
      label: "Smoke amount",
      help: "How much of the screen the smoke covers.",
      ends: ["Thin", "Thick"],
      params: [
        // Ink shows where the smoke is denser than the threshold.
        {
          path: ["settings", "smoke", "threshold"],
          factor: 0.5,
          min: 0.05,
          max: 0.9,
        },
        { path: ["settings", "smoke", "haze"], factor: 2, min: 0, max: 1 },
      ],
    },
    drift: {
      kind: "slider",
      label: "Drift",
      help: "How fast the smoke moves and rises.",
      ends: ["Still", "Fast"],
      params: [
        { path: ["settings", "smoke", "speed"], factor: 3, min: 0, max: 0.5 },
        { path: ["settings", "smoke", "rise"], factor: 2, min: -1, max: 1 },
      ],
    },
    swirl: {
      kind: "slider",
      label: "Swirl",
      help: "How much the smoke curls and tears.",
      ends: ["Gentle", "Wild"],
      params: [
        { path: ["settings", "smoke", "warp"], factor: 2, min: 0, max: 6 },
        {
          path: ["settings", "smoke", "turbulence"],
          factor: 1.8,
          min: 0,
          max: 2,
        },
      ],
    },
    grain: {
      kind: "slider",
      label: "Grain",
      help: "Charcoal texture, paper tooth and specks of dust.",
      ends: ["Clean", "Gritty"],
      params: [
        { path: ["settings", "smoke", "grain"], factor: 2.5, min: 0, max: 2 },
        {
          path: ["settings", "smoke", "paperTooth"],
          factor: 2,
          min: 0,
          max: 0.3,
        },
        { path: ["settings", "smoke", "dust"], factor: 3, min: 0, max: 0.1 },
      ],
    },
    edges: {
      kind: "slider",
      label: "Ink edges",
      help: "How strongly the smoke's outline is inked and dotted.",
      ends: ["Soft", "Inked"],
      params: [
        {
          path: ["settings", "smoke", "edgeStrength"],
          factor: 2.5,
          min: 0,
          max: 60,
        },
        {
          path: ["settings", "smoke", "dotDensity"],
          factor: 2,
          min: 0,
          max: 1,
        },
      ],
    },
    touch: {
      kind: "slider",
      label: "Touch reaction",
      help: "How much the smoke follows a finger. Drag on the preview to try it.",
      ends: ["Subtle", "Strong"],
      params: touchParams(["settings", "smoke", "fluidStrength"], 0.02),
    },
    ...retroSwitches,
  },
  looks: [
    { id: "charcoal", label: "Charcoal", values: {} },
    {
      id: "fog",
      label: "Fog",
      values: {
        paperInk: ["#e8e0cf", "#1c1a17"],
        amount: 30,
        swirl: 35,
        grain: 30,
        edges: 25,
      },
    },
    {
      id: "ink",
      label: "Ink",
      values: {
        paperInk: ["#e8e0cf", "#1c1a17"],
        amount: 70,
        edges: 80,
        grain: 70,
      },
    },
  ],
};

export const BACKGROUND_CONTROLS = {
  fluid: FLUID_CONTROLS,
  smoke: SMOKE_CONTROLS,
} as const satisfies Record<BackgroundId, BackgroundControls>;

function getAt(target: unknown, path: ParamPath): unknown {
  return path.reduce<unknown>(
    (node, key) => (node as Record<string | number, unknown>)?.[key],
    target,
  );
}

function setAt(target: unknown, path: ParamPath, value: unknown): void {
  const parent = getAt(target, path.slice(0, -1)) as Record<
    string | number,
    unknown
  >;
  parent[path.at(-1) as string | number] = value;
}

/** A slider position (0–100) as a raw value, around the kit's own `base`. */
export function scaleParam(
  param: ScaledParam,
  base: number,
  position: number,
): number {
  const t =
    (Math.min(100, Math.max(0, position)) - SLIDER_DEFAULT) / SLIDER_DEFAULT;
  const scale = param.factor ** t;
  const raw = param.complement ? 1 - (1 - base) * scale : base * scale;
  const clamped = Math.min(param.max, Math.max(param.min, raw));
  return param.integer ? Math.round(clamped) : clamped;
}

/**
 * The background as it renders: the kit's preset with the event's control
 * values on top. Controls left untouched keep the preset's raw values
 * exactly, so the kit's look is what "no changes" means.
 */
export function applyBackgroundControls(
  base: BackgroundPreset,
  values: BackgroundControlValues,
): BackgroundPreset {
  const preset = cloneBackgroundPreset(base);
  const { controls } = BACKGROUND_CONTROLS[preset.effect];

  for (const [key, value] of Object.entries(values)) {
    const control: BackgroundControl | undefined = controls[key];
    if (!control) continue;

    if (control.kind === "slider" && typeof value === "number") {
      if (value === SLIDER_DEFAULT) continue;
      for (const param of control.params) {
        const raw = getAt(base, param.path);
        if (typeof raw === "number") {
          setAt(preset, param.path, scaleParam(param, raw, value));
        }
      }
    } else if (control.kind === "switch" && typeof value === "boolean") {
      preset.passes[control.pass] = value;
    } else if (control.kind === "colors" && Array.isArray(value)) {
      control.write(preset, value);
    }
  }

  return preset;
}

/** A control's value when the event hasn't changed it. */
export function defaultControlValue(
  control: BackgroundControl,
  base: BackgroundPreset,
): ControlValue {
  switch (control.kind) {
    case "slider":
      return SLIDER_DEFAULT;
    case "switch":
      return base.passes[control.pass];
    case "colors":
      return control.read(base);
  }
}

function isValidControlValue(control: BackgroundControl, value: unknown) {
  switch (control.kind) {
    case "slider":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 100
      );
    case "switch":
      return typeof value === "boolean";
    case "colors":
      return (
        Array.isArray(value) &&
        value.length === control.slots.length &&
        value.every((color) => hexColorSchema.safeParse(color).success)
      );
  }
}

export type BackgroundSettings = {
  id: BackgroundId;
  /** The look last picked, shown as "Charcoal · edited" once a control moves. */
  look?: string;
  values?: BackgroundControlValues;
};

const backgroundSettingsShape = z.object({
  id: z.enum(BACKGROUND_IDS),
  look: z.string().max(40).optional(),
  values: z.record(z.string(), z.unknown()).optional(),
});

/**
 * An event's stored shader settings, keeping every control this release
 * knows, with a value of the right kind. `rejectedKeys` names the rest.
 */
export function readBackgroundSettings(stored: unknown): {
  settings: BackgroundSettings | undefined;
  rejectedKeys: string[];
} {
  if (stored === undefined) return { settings: undefined, rejectedKeys: [] };

  const parsed = backgroundSettingsShape.safeParse(stored);
  if (!parsed.success)
    return { settings: undefined, rejectedKeys: ["background"] };

  const { id, look, values = {} } = parsed.data;
  const { controls } = BACKGROUND_CONTROLS[id];
  const kept: BackgroundControlValues = {};
  const rejectedKeys: string[] = [];

  for (const [key, value] of Object.entries(values)) {
    const control: BackgroundControl | undefined = controls[key];
    if (control && isValidControlValue(control, value)) {
      kept[key] = value as ControlValue;
    } else {
      rejectedKeys.push(`background.values.${key}`);
    }
  }

  return {
    settings: {
      id,
      ...(look ? { look } : {}),
      ...(Object.keys(kept).length > 0 ? { values: kept } : {}),
    },
    rejectedKeys,
  };
}

/** Strict: what the admin may save. A key or value this release can't use is an error. */
export const backgroundSettingsSchema = backgroundSettingsShape.superRefine(
  (value, ctx) => {
    const { rejectedKeys } = readBackgroundSettings(value);
    for (const key of rejectedKeys) {
      ctx.addIssue({
        code: "custom",
        message: `Unknown or invalid control: ${key}`,
      });
    }
  },
);
