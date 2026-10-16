import type { BackgroundPreset } from "#lib/three/internal/features/background.types";
import type {
  FluidBackgroundSettings,
  FluidSimulationSettings,
} from "#lib/three/internal/features/fluid-background/fluid-background.types";
import type { PostProcessingSettings } from "#lib/three/internal/features/post-processing/postProcessing.types";
import type { SmokeBackgroundSettings } from "#lib/three/internal/features/smoke-background/smoke-background.types";

const KIOSK_SIMULATION: FluidSimulationSettings = {
  simRes: 128,
  dyeRes: 512,
  iterations: 2,
  densityDissipation: 0.98,
  velocityDissipation: 0.913,
  pressureDissipation: 0.99,
  curlStrength: 8,
  splatRadius: 0.3,
  idleFrames: 240,
};

const CYAN_FLUID: FluidBackgroundSettings = {
  simulation: KIOSK_SIMULATION,
  turbulence: {
    scale: 0.4,
    intensity: 0.045,
    sinSpeed: 0.1,
    overallSpeed: 0.15,
    direction: [1.0, 0.44],
    fluidStrength: 0.0002,
    palette: ["#000000", "#021820", "#0a5f7a", "#3edbff", "#7ee7ff", "#c9f5ff"],
    stops: [0.15, 0.35, 0.55, 0.87],
  },
};

/** Charcoal smoke after the "Bal des Vampires" poster. */
const CHARCOAL_SMOKE: SmokeBackgroundSettings = {
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
};

const KIOSK_POST_PROCESSING: PostProcessingSettings = {
  ascii: {
    cellSize: 20,
    invert: 1,
    color: 1,
    charBrightness: 1.98,
    backgroundBrightness: 0.56,
    smoothness: 0.1,
  },
  // main's look before presets: `bloom(inputNode, 0.53, 0.35, 0.12)`.
  bloom: { strength: 0.53, radius: 0.35, threshold: 0.12 },
  film: { strength: 0.5 },
  scanlines: { thickness: 6.2, intensity: 0.42, speed: 1, focus: 4.1 },
};

const CHARCOAL_POST_PROCESSING: PostProcessingSettings = {
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
};

export const BACKGROUND_PRESETS = {
  fluid: {
    effect: "fluid",
    settings: CYAN_FLUID,
    postProcessing: KIOSK_POST_PROCESSING,
  },
  smoke: {
    effect: "smoke",
    settings: CHARCOAL_SMOKE,
    postProcessing: CHARCOAL_POST_PROCESSING,
  },
} satisfies Record<string, BackgroundPreset>;

export type BackgroundPresetKey = keyof typeof BACKGROUND_PRESETS;

export const BACKGROUND_PRESET_KEYS = Object.keys(
  BACKGROUND_PRESETS,
) as BackgroundPresetKey[];

export const DEFAULT_BACKGROUND_PRESET: BackgroundPresetKey = "fluid";
