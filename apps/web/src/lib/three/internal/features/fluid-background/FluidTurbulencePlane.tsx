import type { Texture } from "three";
import type { ParametersGroup } from "three/addons/inspector/tabs/Parameters.js";
import type { TextureNode, WebGPURenderer } from "three/webgpu";

import { HalfFloatType, LinearFilter, RenderTarget, RGBAFormat } from "three";
import { positionLocal, uniformTexture, uv, vec4 } from "three/tsl";
import {
  Mesh,
  MeshBasicNodeMaterial,
  NodeMaterial,
  PlaneGeometry,
  QuadMesh,
} from "three/webgpu";

import type { ViewportSize } from "#lib/three/internal/runtime/runtime.types";

import { disposeMaterial } from "#lib/three/internal/runtime/disposeMaterial";

import {
  buildTurbulencesNode,
  createTurbulenceState,
} from "./nodes/turbulencesNode";

const TURBULENCE_SCALE = 0.1;

export class FluidTurbulencePlane extends Mesh<
  PlaneGeometry,
  MeshBasicNodeMaterial
> {
  readonly fluidTexture: TextureNode;

  private readonly _turbulenceRT: RenderTarget;
  private readonly _turbulenceQuad: QuadMesh;
  private readonly _turbulenceTex: TextureNode;
  private readonly _turbulenceState: ReturnType<typeof createTurbulenceState>;
  private _renderer: WebGPURenderer | null = null;

  constructor(size: ViewportSize) {
    const geometry = new PlaneGeometry(2, 2);
    const material = new MeshBasicNodeMaterial();
    material.lights = false;

    const fluidTex = uniformTexture();
    const turbulenceTex = uniformTexture();
    const turbulenceState = createTurbulenceState();

    const turbulenceSample = turbulenceTex.sample(uv()).rgb;

    material.vertexNode = vec4(positionLocal.xy, 1.0, 1.0);
    material.colorNode = turbulenceSample;

    super(geometry, material);
    this.fluidTexture = fluidTex;
    this._turbulenceTex = turbulenceTex;
    this.frustumCulled = false;
    this.renderOrder = -1;

    const turbulenceMat = new NodeMaterial();
    const turbulenceColor = buildTurbulencesNode(fluidTex, turbulenceState);
    turbulenceMat.fragmentNode = vec4(turbulenceColor, 1.0);

    this._turbulenceQuad = new QuadMesh(turbulenceMat);
    this._turbulenceState = turbulenceState;
    this._turbulenceRT = new RenderTarget(
      Math.ceil(size.width * TURBULENCE_SCALE),
      Math.ceil(size.height * TURBULENCE_SCALE),
      {
        type: HalfFloatType,
        format: RGBAFormat,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        depthBuffer: false,
      },
    );
  }

  init(renderer: WebGPURenderer): void {
    this._renderer = renderer;
  }

  attachDebug(folder: ParametersGroup): void {
    const {
      cScale,
      cIntensity,
      uSinSpeed,
      uOverallSpeed,
      uDirection,
      uColor0,
      uColor1,
      uColor2,
      uColor3,
      uColor4,
      uColor5,
      uStop1,
      uStop2,
      uStop3,
      uStop4,
      uRcpIntensity,
      rebuildColorRampLUT,
    } = this._turbulenceState;

    const turbulencesFolder = folder.addFolder("Turbulences");
    turbulencesFolder.add(cScale, "value", 0, 1, 0.01).name("Scale");
    turbulencesFolder
      .add(cIntensity, "value", 0.001, 1, 0.01)
      .name("Intensity")
      .onChange(() => {
        uRcpIntensity.value = 1.0 / cIntensity.value;
      });
    turbulencesFolder.add(uSinSpeed, "value", 0, 1, 0.01).name("Sin Speed");
    turbulencesFolder
      .add(uOverallSpeed, "value", 0, 1, 0.01)
      .name("Overall Speed");
    turbulencesFolder
      .add(uDirection.value, "x", 0, 1, 0.01)
      .name("Direction X");
    turbulencesFolder
      .add(uDirection.value, "y", 0, 1, 0.01)
      .name("Direction Y");

    const colorsFolder = turbulencesFolder.addFolder("Palette");
    colorsFolder
      .addColor(uColor0, "value")
      .name("Color 0 (Low)")
      .onChange(rebuildColorRampLUT);
    colorsFolder
      .addColor(uColor1, "value")
      .name("Color 1")
      .onChange(rebuildColorRampLUT);
    colorsFolder
      .addColor(uColor2, "value")
      .name("Color 2")
      .onChange(rebuildColorRampLUT);
    colorsFolder
      .addColor(uColor3, "value")
      .name("Color 3")
      .onChange(rebuildColorRampLUT);
    colorsFolder
      .addColor(uColor4, "value")
      .name("Color 4")
      .onChange(rebuildColorRampLUT);
    colorsFolder
      .addColor(uColor5, "value")
      .name("Color 5 (High)")
      .onChange(rebuildColorRampLUT);

    const stopsFolder = turbulencesFolder.addFolder("Color Stops");
    stopsFolder
      .add(uStop1, "value", 0, 1, 0.01)
      .name("Stop 1")
      .onChange(rebuildColorRampLUT);
    stopsFolder
      .add(uStop2, "value", 0, 1, 0.01)
      .name("Stop 2")
      .onChange(rebuildColorRampLUT);
    stopsFolder
      .add(uStop3, "value", 0, 1, 0.01)
      .name("Stop 3")
      .onChange(rebuildColorRampLUT);
    stopsFolder
      .add(uStop4, "value", 0, 1, 0.01)
      .name("Stop 4")
      .onChange(rebuildColorRampLUT);
  }

  setFluidTexture(texture: Texture): void {
    this.fluidTexture.value = texture;
  }

  updateTurbulence(): void {
    if (!this._renderer) return;
    this._renderer.setRenderTarget(this._turbulenceRT);
    this._turbulenceQuad.render(this._renderer);
    this._renderer.setRenderTarget(null);
    this._turbulenceTex.value = this._turbulenceRT.texture;
  }

  resize(size: ViewportSize): void {
    this._turbulenceRT.setSize(
      Math.ceil(size.width * TURBULENCE_SCALE),
      Math.ceil(size.height * TURBULENCE_SCALE),
    );
  }

  override dispose(): void {
    this.geometry.dispose();
    this._turbulenceRT.dispose();
    try {
      this.material.dispose();
      disposeMaterial(this._turbulenceQuad.material);
    } catch {
      /* Material disposal can fail before first WebGPU compilation. */
    }
    this._turbulenceState.dispose();
    // The browser bundle does not resolve super.dispose() through Mesh.
    Object.getPrototypeOf(Mesh.prototype).dispose.call(this);
  }
}
