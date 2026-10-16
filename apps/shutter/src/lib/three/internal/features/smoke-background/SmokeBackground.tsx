import type { ParametersGroup } from "three/addons/inspector/tabs/Parameters.js";
import type { Scene, WebGPURenderer } from "three/webgpu";

import type { ViewportSize } from "#lib/three/internal/runtime/runtime.types";

import type { BackgroundEffect } from "../background.types";
import type { Splat } from "../fluid-background/fluid-background.types";
import type { SmokeBackgroundSettings } from "./smoke-background.types";

import { FluidSimulation } from "../fluid-background/FluidSimulation";
import { SmokeCharcoalPlane } from "./SmokeCharcoalPlane";

interface SmokeBackgroundParams {
  settings: SmokeBackgroundSettings;
  size: ViewportSize;
  splats: () => Splat[];
}

export class SmokeBackground implements BackgroundEffect {
  private readonly _simulation: FluidSimulation;
  private readonly _plane: SmokeCharcoalPlane;
  private readonly _splats: () => Splat[];
  private _scene: Scene | null = null;

  constructor({ settings, size, splats }: SmokeBackgroundParams) {
    this._simulation = new FluidSimulation(settings.simulation);
    this._plane = new SmokeCharcoalPlane(size, settings.smoke);
    this._splats = splats;
  }

  attach(scene: Scene): void {
    this._scene = scene;
    scene.add(this._plane);
  }

  init(renderer: WebGPURenderer): void {
    this._simulation.init(renderer);
    this._plane.init(renderer);
    this._plane.setFluidTexture(this._simulation.densityTexture);
  }

  attachDebug(folder: ParametersGroup): void {
    this._simulation.attachDebug(folder);
    this._plane.attachDebug(folder);
  }

  update(delta: number): void {
    const splats = this._splats();
    if (this._simulation.shouldStep(splats)) {
      this._simulation.step(splats, delta);
      this._plane.setFluidTexture(this._simulation.densityTexture);
    }
    this._plane.updateField();
  }

  resize(size: ViewportSize): void {
    this._plane.resize(size);
  }

  dispose(): void {
    if (this._scene) {
      this._scene.remove(this._plane);
      this._scene = null;
    }
    this._plane.dispose();
    this._simulation.dispose();
  }
}
