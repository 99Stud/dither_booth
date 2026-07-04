export interface Splat {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export interface FluidBackgroundOptions {
  simRes?: number;
  dyeRes?: number;
  iterations?: number;
  densityDissipation?: number;
  velocityDissipation?: number;
  pressureDissipation?: number;
  curlStrength?: number;
  splatRadius?: number;
  idleFrames?: number;
}
