import type { Texture } from "three";
import type { ParametersGroup } from "three/addons/inspector/tabs/Parameters.js";
import type { TextureNode, WebGPURenderer } from "three/webgpu";

import { HalfFloatType, LinearFilter, RenderTarget, RGBAFormat } from "three";
import { positionLocal, uniformTexture, vec4 } from "three/tsl";
import {
  Mesh,
  MeshBasicNodeMaterial,
  NodeMaterial,
  PlaneGeometry,
  QuadMesh,
} from "three/webgpu";

import type { ViewportSize } from "#lib/three/internal/runtime/runtime.types";

import { disposeMaterial } from "#lib/three/internal/runtime/disposeMaterial";

import type { SmokeState } from "./nodes/smokeNode";
import type { SmokeSettings } from "./smoke-background.types";

import {
  buildSmokeCharcoalNode,
  buildSmokeFieldNode,
  createSmokeState,
} from "./nodes/smokeNode";

export class SmokeCharcoalPlane extends Mesh<
  PlaneGeometry,
  MeshBasicNodeMaterial
> {
  private readonly _fluidTex: TextureNode;
  private readonly _fieldRT: RenderTarget;
  private readonly _fieldQuad: QuadMesh;
  private readonly _fieldScale: number;
  private readonly _smokeState: SmokeState;
  private _renderer: WebGPURenderer | null = null;

  constructor(size: ViewportSize, settings: SmokeSettings) {
    const geometry = new PlaneGeometry(2, 2);
    const material = new MeshBasicNodeMaterial();
    material.lights = false;

    const fluidTex = uniformTexture();
    const fieldTex = uniformTexture();
    const smokeState = createSmokeState(settings);

    material.vertexNode = vec4(positionLocal.xy, 1.0, 1.0);
    material.colorNode = buildSmokeCharcoalNode(fieldTex, smokeState);

    super(geometry, material);
    this._fluidTex = fluidTex;
    this.frustumCulled = false;
    this.renderOrder = -1;

    const fieldMat = new NodeMaterial();
    fieldMat.fragmentNode = buildSmokeFieldNode(fluidTex, smokeState);

    this._fieldQuad = new QuadMesh(fieldMat);
    this._fieldScale = settings.fieldScale;
    this._smokeState = smokeState;
    this._fieldRT = new RenderTarget(1, 1, {
      type: HalfFloatType,
      format: RGBAFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
    });
    fieldTex.value = this._fieldRT.texture;
    this.resize(size);
  }

  init(renderer: WebGPURenderer): void {
    this._renderer = renderer;
  }

  attachDebug(folder: ParametersGroup): void {
    const {
      uScale,
      uSpeed,
      uDrift,
      uWarp,
      uTurbulence,
      uLacunarity,
      uGain,
      uRise,
      uFluidStrength,
      uThreshold,
      uSoftness,
      uSmudge,
      uHaze,
      uGrit,
      uGrain,
      uGrainSize,
      uGrainFps,
      uEdgeWidth,
      uEdgeStrength,
      uFresnelPower,
      uEdgeGrain,
      uDotSize,
      uDotDensity,
      uDust,
      uPaperColor,
      uInkColor,
      uPaperTooth,
    } = this._smokeState;

    const fieldFolder = folder.addFolder("Smoke Field");
    fieldFolder.add(uScale, "value", 0.2, 6, 0.01).name("Scale");
    fieldFolder.add(uSpeed, "value", 0, 0.5, 0.005).name("Speed");
    fieldFolder.add(uDrift.value, "x", -2, 2, 0.01).name("Drift X");
    fieldFolder.add(uDrift.value, "y", -2, 2, 0.01).name("Drift Y");
    fieldFolder.add(uWarp, "value", 0, 6, 0.01).name("Warp");
    fieldFolder.add(uTurbulence, "value", 0, 2, 0.01).name("Turbulence");
    fieldFolder.add(uLacunarity, "value", 1.2, 3.5, 0.01).name("Lacunarity");
    fieldFolder.add(uGain, "value", 0.2, 0.8, 0.01).name("Gain");
    fieldFolder.add(uRise, "value", -1, 1, 0.01).name("Rise");
    fieldFolder
      .add(uFluidStrength, "value", 0, 0.02, 0.0001)
      .name("Fluid Strength");

    const charcoalFolder = folder.addFolder("Charcoal");
    charcoalFolder.add(uThreshold, "value", 0, 1, 0.01).name("Threshold");
    charcoalFolder.add(uSoftness, "value", 0.01, 0.5, 0.01).name("Softness");
    charcoalFolder.add(uSmudge, "value", 0, 1, 0.01).name("Smudge");
    charcoalFolder.add(uHaze, "value", 0, 1, 0.01).name("Haze");
    charcoalFolder.add(uGrit, "value", 0, 1, 0.01).name("Grit");
    charcoalFolder.add(uGrain, "value", 0, 2, 0.01).name("Grain");
    charcoalFolder.add(uGrainSize, "value", 1, 8, 0.1).name("Grain Size");
    charcoalFolder.add(uGrainFps, "value", 0, 24, 1).name("Grain FPS");

    const edgesFolder = folder.addFolder("Fresnel Edges");
    edgesFolder.add(uEdgeWidth, "value", 0.5, 8, 0.1).name("Edge Width");
    edgesFolder.add(uEdgeStrength, "value", 0, 60, 0.5).name("Edge Strength");
    edgesFolder.add(uFresnelPower, "value", 0.1, 4, 0.05).name("Fresnel Power");
    edgesFolder.add(uEdgeGrain, "value", 0, 4, 0.01).name("Edge Grain");
    edgesFolder.add(uDotSize, "value", 2, 16, 0.5).name("Dot Size");
    edgesFolder.add(uDotDensity, "value", 0, 1, 0.01).name("Dot Density");
    edgesFolder.add(uDust, "value", 0, 0.1, 0.001).name("Dust");

    const paperFolder = folder.addFolder("Paper");
    paperFolder.addColor(uPaperColor, "value").name("Paper Color");
    paperFolder.addColor(uInkColor, "value").name("Ink Color");
    paperFolder.add(uPaperTooth, "value", 0, 0.3, 0.005).name("Paper Tooth");
  }

  setFluidTexture(texture: Texture): void {
    this._fluidTex.value = texture;
  }

  updateField(): void {
    if (!this._renderer) return;
    this._renderer.setRenderTarget(this._fieldRT);
    this._fieldQuad.render(this._renderer);
    this._renderer.setRenderTarget(null);
  }

  resize(size: ViewportSize): void {
    const width = Math.ceil(size.width * this._fieldScale);
    const height = Math.ceil(size.height * this._fieldScale);
    this._fieldRT.setSize(width, height);
    this._smokeState.uFieldTexel.value.set(1 / width, 1 / height);
  }

  override dispose(): void {
    this.geometry.dispose();
    this._fieldRT.dispose();
    try {
      this.material.dispose();
      disposeMaterial(this._fieldQuad.material);
    } catch {
      /* Material disposal can fail before first WebGPU compilation. */
    }
    // The browser bundle does not resolve super.dispose() through Mesh.
    Object.getPrototypeOf(Mesh.prototype).dispose.call(this);
  }
}
