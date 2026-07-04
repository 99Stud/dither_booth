import type { Texture } from "three";
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

  dispose(): void {
    this.geometry.dispose();
    this._turbulenceRT.dispose();
    try {
      this.material.dispose();
      disposeMaterial(this._turbulenceQuad.material);
    } catch {
      /* Material disposal can fail before first WebGPU compilation. */
    }
    this._turbulenceState.dispose();
  }
}
