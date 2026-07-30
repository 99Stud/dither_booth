import type { Scene, WebGPURenderer } from "three/webgpu";

import type { ViewportSize } from "#lib/three/internal/runtime/runtime.types";

import type { FluidBackgroundOptions, Splat } from "./fluid-background.types";

import { FluidSimulation } from "./FluidSimulation";
import { FluidTurbulencePlane } from "./FluidTurbulencePlane";

interface FluidBackgroundParams {
  options?: FluidBackgroundOptions;
  size: ViewportSize;
  splats: () => Splat[];
}

export class FluidBackground {
  private readonly _simulation: FluidSimulation;
  private readonly _plane: FluidTurbulencePlane;
  private readonly _splats: () => Splat[];
  private _scene: Scene | null = null;

  constructor({ options, size, splats }: FluidBackgroundParams) {
    this._simulation = new FluidSimulation(options);
    this._plane = new FluidTurbulencePlane(size);
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

  update(delta: number): void {
    const splats = this._splats();
    if (this._simulation.shouldStep(splats)) {
      this._simulation.step(splats, delta);
      this._plane.setFluidTexture(this._simulation.densityTexture);
    }
    this._plane.updateTurbulence();
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
