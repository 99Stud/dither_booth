export interface Splat {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export interface FluidSimulationSettings {
  simRes: number;
  dyeRes: number;
  iterations: number;
  densityDissipation: number;
  velocityDissipation: number;
  pressureDissipation: number;
  curlStrength: number;
  splatRadius: number;
  idleFrames: number;
}

export interface TurbulenceSettings {
  scale: number;
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
