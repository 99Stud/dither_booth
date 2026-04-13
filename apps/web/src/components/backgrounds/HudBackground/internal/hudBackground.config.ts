export const TURBULENCE = {
  scale: 0.33,
  intensity: 0.07,
  sinSpeed: 0.1,
  overallSpeed: 0.15,
  directionX: 1,
  directionY: 0.44,
} as const;

export const PALETTE = {
  color0: "#000000",
  color1: "#1a1a1a",
  color2: "#2a1a0a",
  color3: "#e8760a",
  color4: "#c45e00",
  color5: "#0a0a0a",
} as const;

export const COLOR_STOPS = {
  stop1: 0.19,
  stop2: 0.22,
  stop3: 0.17,
  stop4: 0.62,
} as const;

export const FLUID = {
  simRes: 128,
  dyeRes: 512,
  iterations: 2,
  densityDissipation: 0.98,
  velocityDissipation: 0.913,
  pressureDissipation: 0.99,
  curlStrength: 27,
  splatRadius: 0.35,
} as const;

export const ASCII = {
  cellSize: 20,
  invert: 0,
  color: 1,
  charBrightness: 1.12,
  bgBrightness: 0.6,
} as const;

export const BLOOM = {
  strength: 0.53,
  radius: 0.35,
  threshold: 0.12,
} as const;

export const FILM = {
  strength: 0,
} as const;

export const SCANLINES = {
  thickness: 6.9,
  intensity: 0.42,
  speed: 1.9,
  focus: 4.5,
} as const;

export const TURBULENCE_RT_SCALE = 0.1;
export const FLUID_STRENGTH = 0.0002;
