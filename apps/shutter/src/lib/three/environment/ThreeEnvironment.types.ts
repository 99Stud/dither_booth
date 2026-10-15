import type { FluidBackgroundOptions } from "../internal/features/fluid-background/fluid-background.types";
import type { PostProcessingOptions } from "../internal/features/post-processing/postProcessing.types";

export interface ThreeEnvironmentSize {
  width: number;
  height: number;
  pixelRatio: number;
}

export interface ThreeEnvironmentOptions {
  container: HTMLElement;
  pixelRatio?: number;
  postProcessing?: PostProcessingOptions;
  fluidBackground?: FluidBackgroundOptions;
}
