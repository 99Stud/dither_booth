import type { ParametersGroup } from "three/addons/inspector/tabs/Parameters.js";
import type { Scene, WebGPURenderer } from "three/webgpu";

import type { ViewportSize } from "#lib/three/internal/runtime/runtime.types";

import type { FluidBackgroundSettings } from "./fluid-background/fluid-background.types";
import type { PostProcessingSettings } from "./post-processing/postProcessing.types";
import type { SmokeBackgroundSettings } from "./smoke-background/smoke-background.types";

export type BackgroundPreset =
  | {
      effect: "fluid";
      settings: FluidBackgroundSettings;
      postProcessing: PostProcessingSettings;
    }
  | {
      effect: "smoke";
      settings: SmokeBackgroundSettings;
      postProcessing: PostProcessingSettings;
    };

export interface BackgroundEffect {
  attach(scene: Scene): void;
  init(renderer: WebGPURenderer): void;
  attachDebug(folder: ParametersGroup): void;
  update(delta: number): void;
  resize(size: ViewportSize): void;
  dispose(): void;
}
