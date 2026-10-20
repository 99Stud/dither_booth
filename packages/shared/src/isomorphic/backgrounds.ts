/**
 * The kiosk's shader backgrounds as data: every value a background reads,
 * and the built-in presets. Shutter renders them (`lib/three`); kits and
 * the admin pick and tune them without loading any WebGPU code.
 */

export const BACKGROUND_IDS = ["fluid", "smoke"] as const;

export type BackgroundId = (typeof BACKGROUND_IDS)[number];

export const BACKGROUND_LABELS: Record<BackgroundId, string> = {
  fluid: "Fluid ascii",
  smoke: "Charcoal smoke",
};

export interface FluidSimulationSettings {
  /** Performance budget (code only): grid sizes, solver passes, idle time. */
  simRes: number;
  dyeRes: number;
  iterations: number;
  idleFrames: number;
  densityDissipation: number;
  velocityDissipation: number;
  pressureDissipation: number;
  curlStrength: number;
  splatRadius: number;
}

export interface TurbulenceSettings {
  scale: number;
  /** The shader reads `1 / intensity`. */
  intensity: number;
  sinSpeed: number;
  overallSpeed: number;
  direction: [x: number, y: number];
  fluidStrength: number;
  palette: [string, string, string, string, string, string];
  stops: [number, number, number, number];
}

export interface FluidBackgroundSettings {
  simulation: FluidSimulationSettings;
  turbulence: TurbulenceSettings;
}

export interface SmokeSettings {
  /** Performance budget (code only): the smoke field's resolution scale. */
  fieldScale: number;
  scale: number;
  speed: number;
  drift: [x: number, y: number];
  warp: number;
  turbulence: number;
  lacunarity: number;
  gain: number;
  rise: number;
  fluidStrength: number;
  threshold: number;
  softness: number;
  smudge: number;
  haze: number;
  grit: number;
  grain: number;
  grainSize: number;
  grainFps: number;
  edgeWidth: number;
  edgeStrength: number;
  fresnelPower: number;
  edgeGrain: number;
  dotSize: number;
  dotDensity: number;
  dust: number;
  paperColor: string;
  inkColor: string;
  paperTooth: number;
}

export interface SmokeBackgroundSettings {
  simulation: FluidSimulationSettings;
  smoke: SmokeSettings;
}

export const POST_PASS_KEYS = [
  "ascii",
  "bloom",
  "crt",
  "film",
  "scanlines",
] as const;

export type PostPassKey = (typeof POST_PASS_KEYS)[number];

/** Which post passes run. Changing one rebuilds the post chain. */
export type PostPasses = Record<PostPassKey, boolean>;

export interface AsciiSettings {
  cellSize: number;
  invert: number;
  color: number;
  charBrightness: number;
  backgroundBrightness: number;
  smoothness: number;
}

export interface BloomSettings {
  strength: number;
  radius: number;
  threshold: number;
}

export interface FilmSettings {
  strength: number;
}

export interface ScanlinesSettings {
  thickness: number;
  intensity: number;
  speed: number;
  focus: number;
}

/** Tunable values for each post pass. */
export interface PostProcessingSettings {
  ascii: AsciiSettings;
  bloom: BloomSettings;
  film: FilmSettings;
  scanlines: ScanlinesSettings;
}

export type BackgroundPreset =
  | {
      effect: "fluid";
      settings: FluidBackgroundSettings;
      postProcessing: PostProcessingSettings;
      passes: PostPasses;
    }
  | {
      effect: "smoke";
      settings: SmokeBackgroundSettings;
      postProcessing: PostProcessingSettings;
      passes: PostPasses;
    };

const KIOSK_SIMULATION: FluidSimulationSettings = {
  simRes: 128,
  dyeRes: 512,
  iterations: 2,
  idleFrames: 240,
  densityDissipation: 0.98,
  velocityDissipation: 0.913,
  pressureDissipation: 0.99,
  curlStrength: 8,
  splatRadius: 0.3,
};

/** Today's kiosk look: cyan fluid under an ascii screen. */
const DEEP_SEA_FLUID: BackgroundPreset = {
  effect: "fluid",
  settings: {
    simulation: KIOSK_SIMULATION,
    turbulence: {
      scale: 0.4,
      intensity: 0.045,
      sinSpeed: 0.1,
      overallSpeed: 0.15,
      direction: [1.0, 0.44],
      fluidStrength: 0.0002,
      palette: [
        "#000000",
        "#021820",
        "#0a5f7a",
        "#3edbff",
        "#7ee7ff",
        "#c9f5ff",
      ],
      stops: [0.15, 0.35, 0.55, 0.87],
    },
  },
  postProcessing: {
    ascii: {
      cellSize: 20,
      invert: 1,
      color: 1,
      charBrightness: 1.98,
      backgroundBrightness: 0.56,
      smoothness: 0.1,
    },
    bloom: { strength: 0.53, radius: 0.35, threshold: 0.12 },
    film: { strength: 0.5 },
    scanlines: { thickness: 6.2, intensity: 0.42, speed: 1, focus: 4.1 },
  },
  passes: { ascii: true, bloom: true, crt: false, film: true, scanlines: true },
};

/** Charcoal smoke after the "Bal des Vampires" poster (#18). */
const CHARCOAL_SMOKE: BackgroundPreset = {
  effect: "smoke",
  settings: {
    simulation: { ...KIOSK_SIMULATION, curlStrength: 8.5 },
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
  passes: { ascii: true, bloom: true, crt: false, film: true, scanlines: true },
};

/** Each background's own look, used when a kit picks it without its own. */
export const BACKGROUND_PRESETS = {
  fluid: DEEP_SEA_FLUID,
  smoke: CHARCOAL_SMOKE,
} as const satisfies Record<BackgroundId, BackgroundPreset>;

export const cloneBackgroundPreset = (
  preset: BackgroundPreset,
): BackgroundPreset => structuredClone(preset);
