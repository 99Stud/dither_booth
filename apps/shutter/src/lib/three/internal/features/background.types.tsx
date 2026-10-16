import type { BackgroundPreset } from "@dither-booth/shared/backgrounds";
import type { ParametersGroup } from "three/addons/inspector/tabs/Parameters.js";
import type { Scene, WebGPURenderer } from "three/webgpu";

import type { ViewportSize } from "#lib/three/internal/runtime/runtime.types";

export type { BackgroundPreset };

export interface BackgroundEffect {
  attach(scene: Scene): void;
  init(renderer: WebGPURenderer): void;
  attachDebug(folder: ParametersGroup): void;
  /**
   * Writes a preset of the same background into the live uniforms, so the
   * look changes without rebuilding anything. The performance budget
   * (resolutions, solver passes) is read once, at construction.
   */
  applySettings(preset: BackgroundPreset): void;
  update(delta: number): void;
  resize(size: ViewportSize): void;
  dispose(): void;
}
