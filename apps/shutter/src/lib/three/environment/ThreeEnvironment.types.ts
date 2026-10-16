import type { BackgroundPreset } from "../internal/features/background.types";
import type { PostProcessingOptions } from "../internal/features/post-processing/postProcessing.types";
import type { BackgroundPresetKey } from "../presets/backgroundPresets";

export type { BackgroundPreset, BackgroundPresetKey };

export interface ThreeEnvironmentSize {
  width: number;
  height: number;
  pixelRatio: number;
}

export interface ThreeEnvironmentOptions {
  container: HTMLElement;
  pixelRatio?: number;
  postProcessing?: PostProcessingOptions;
  background?: BackgroundPresetKey | BackgroundPreset;
}
