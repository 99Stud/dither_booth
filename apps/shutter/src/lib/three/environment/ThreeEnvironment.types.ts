import type { BackgroundPreset } from "../internal/features/background.types";

export type { BackgroundPreset };

export interface ThreeEnvironmentSize {
  width: number;
  height: number;
  pixelRatio: number;
}

export interface ThreeEnvironmentOptions {
  container: HTMLElement;
  pixelRatio?: number;
  /** The look to start with; `apply` changes it later. */
  background?: BackgroundPreset;
}
