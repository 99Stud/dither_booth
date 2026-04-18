export const TURBULENCE = {
  scale: 0.33,
  intensity: 0.07,
  sinSpeed: 0.1,
  overallSpeed: 0.11,
  directionX: 1,
  directionY: 0.44,
} as const;

export const PALETTE = {
  color0: "#000000",
  color1: "#000000",
  color2: "#000000",
  color3: "#F07023",
  color4: "#000000",
  color5: "#000000",
} as const;

export const COLOR_STOPS = {
  stop1: 0.2,
  stop2: 0.37,
  stop3: 0.55,
  stop4: 0.87,
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
  cellSize: 24,
  invert: 0,
  color: 1,
  charBrightness: 1.49,
  bgBrightness: 0.6,
} as const;

export const BLOOM = {
  strength: 0.29,
  radius: 0.51,
  threshold: 0.09,
} as const;

export const FILM = {
  strength: 0,
} as const;

export const TURBULENCE_RT_SCALE = 0.1;
export const FLUID_STRENGTH = 0.0002;
