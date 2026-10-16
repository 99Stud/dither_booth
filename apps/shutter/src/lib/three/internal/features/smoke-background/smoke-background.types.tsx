import type { FluidSimulationSettings } from "../fluid-background/fluid-background.types";

export interface SmokeSettings {
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
