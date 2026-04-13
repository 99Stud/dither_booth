import { HalfFloatType, LinearFilter, RGBAFormat, RenderTarget } from "three";
import { positionLocal, uniform, uniformTexture, uv, vec4 } from "three/tsl";
import type { TextureNode, WebGPURenderer } from "three/webgpu";
import { Mesh, MeshStandardNodeMaterial, NodeMaterial, PlaneGeometry, QuadMesh } from "three/webgpu";
import { buildTurbulencesNode } from "./turbulences.ts";
import { TURBULENCE_RT_SCALE, FLUID_STRENGTH } from "../hudBackground.config.ts";

const uFluidStrength = uniform(FLUID_STRENGTH);

export class FsQuad extends Mesh<PlaneGeometry, MeshStandardNodeMaterial> {
  readonly fluidTexture: TextureNode;

  private _turbulenceRT: RenderTarget;
  private _turbulenceQuad: QuadMesh;
  private _turbulenceTex: TextureNode;
  private _renderer: WebGPURenderer | null = null;

  constructor() {
    const geometry = new PlaneGeometry(2, 2);
    const material = new MeshStandardNodeMaterial();
    material.lights = false;

    const fluidTex = uniformTexture();
    const turbulenceTex = uniformTexture();

    const turbulenceSample = turbulenceTex.sample(uv()).rgb;

    material.vertexNode = vec4(positionLocal.xy, 1.0, 1.0);
    material.colorNode = turbulenceSample;
    material.emissiveNode = turbulenceSample;

    super(geometry, material);
    this.fluidTexture = fluidTex;
    this._turbulenceTex = turbulenceTex;
    this.frustumCulled = false;
    this.renderOrder = -1;

    const turbulenceMat = new NodeMaterial();
    const turbulenceColor = buildTurbulencesNode(fluidTex, uFluidStrength);
    turbulenceMat.fragmentNode = vec4(turbulenceColor, 1.0);

    this._turbulenceQuad = new QuadMesh(turbulenceMat);

    const w = Math.ceil(window.innerWidth * TURBULENCE_RT_SCALE);
    const h = Math.ceil(window.innerHeight * TURBULENCE_RT_SCALE);
    this._turbulenceRT = new RenderTarget(w, h, {
      type: HalfFloatType,
      format: RGBAFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
    });
  }

  init(renderer: WebGPURenderer): void {
    this._renderer = renderer;
  }

  updateTurbulence(): void {
    if (!this._renderer) return;
    this._renderer.setRenderTarget(this._turbulenceRT);
    this._turbulenceQuad.render(this._renderer);
    this._renderer.setRenderTarget(null);
    this._turbulenceTex.value = this._turbulenceRT.texture;
  }

  resize(width: number, height: number): void {
    const w = Math.ceil(width * TURBULENCE_RT_SCALE);
    const h = Math.ceil(height * TURBULENCE_RT_SCALE);
    this._turbulenceRT.setSize(w, h);
  }

  dispose(): void {
    this.geometry.dispose();
    this._turbulenceRT.dispose();
    try {
      this.material.dispose();
    } catch {
      /* material might not be compiled yet */
    }
  }
}
