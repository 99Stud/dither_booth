import type { Texture } from "three";
import type { MagnificationTextureFilter, PixelFormat } from "three";
import type { Node, TextureNode } from "three/webgpu";
import type { WebGPURenderer } from "three/webgpu";

import {
  HalfFloatType,
  LinearFilter,
  NearestFilter,
  RedFormat,
  RenderTarget,
  RGBAFormat,
  RGFormat,
} from "three";
import {
  abs,
  float,
  Fn,
  uniform,
  uniformTexture,
  uv,
  vec2,
  vec4,
} from "three/tsl";
import { NodeMaterial, QuadMesh } from "three/webgpu";

import { disposeMaterial } from "#lib/three/internal/runtime/disposeMaterial";

import type { FluidBackgroundOptions, Splat } from "./fluid-background.types";

interface DoubleFBO {
  read: RenderTarget;
  write: RenderTarget;
  swap(): void;
}

const DEFAULTS: Required<FluidBackgroundOptions> = {
  simRes: 128,
  dyeRes: 512,
  iterations: 2,
  densityDissipation: 0.98,
  velocityDissipation: 0.913,
  pressureDissipation: 0.99,
  curlStrength: 8,
  splatRadius: 0.3,
  idleFrames: 180,
};

function createFluidSimulationUniforms(
  config: Required<FluidBackgroundOptions>,
) {
  const rcpSim = 1 / config.simRes;

  return {
    uDensityDissipation: uniform(config.densityDissipation),
    uVelocityDissipation: uniform(config.velocityDissipation),
    uPressureDissipation: uniform(config.pressureDissipation),
    uCurlStrength: uniform(config.curlStrength),
    uSplatRadius: uniform(config.splatRadius),
    uSimTexelSize: uniform(vec2(rcpSim, rcpSim)),
  };
}

type FluidSimulationUniforms = ReturnType<typeof createFluidSimulationUniforms>;

function createDoubleFBO(
  width: number,
  height: number,
  format: PixelFormat,
  filter: MagnificationTextureFilter,
): DoubleFBO {
  const opts = {
    type: HalfFloatType,
    format,
    minFilter: filter,
    magFilter: filter,
    depthBuffer: false,
  };
  const fbo: DoubleFBO = {
    read: new RenderTarget(width, height, opts),
    write: new RenderTarget(width, height, opts),
    swap() {
      const tmp = fbo.read;
      fbo.read = fbo.write;
      fbo.write = tmp;
    },
  };
  return fbo;
}

function createPass(fragmentNode: Node) {
  const mat = new NodeMaterial();
  mat.fragmentNode = fragmentNode;
  return new QuadMesh(mat);
}

function buildSplatPass(uniforms: FluidSimulationUniforms) {
  const uTarget = uniformTexture();
  const uAspect = uniform(1);
  const uPoint = uniform(vec2(0, 0));
  const uColor = uniform(vec2(0, 0));

  const node = Fn(() => {
    const coord = uv();
    const p = coord.sub(uPoint).toVar();
    p.x.mulAssign(uAspect);
    const radius = uniforms.uSplatRadius.div(100);
    const splat = uColor.mul(float(-1).mul(p.dot(p)).div(radius).exp());
    const base = uTarget.sample(coord);
    return vec4(base.rg.add(splat), 0.0, 1.0);
  })();

  return { quad: createPass(node), uTarget, uAspect, uPoint, uColor };
}

function buildSplatDyePass(uniforms: FluidSimulationUniforms) {
  const uTarget = uniformTexture();
  const uAspect = uniform(1);
  const uPoint = uniform(vec2(0, 0));
  const uColor = uniform(vec2(0, 0));

  const node = Fn(() => {
    const coord = uv();
    const p = coord.sub(uPoint).toVar();
    p.x.mulAssign(uAspect);
    const radius = uniforms.uSplatRadius.div(100);
    const splatVal = float(-1).mul(p.dot(p)).div(radius).exp();
    const base = uTarget.sample(coord);
    return vec4(base.rgb.add(vec4(uColor, 1.0, 0.0).rgb.mul(splatVal)), 1.0);
  })();

  return { quad: createPass(node), uTarget, uAspect, uPoint, uColor };
}

function buildAdvectionPass() {
  const uVelocity = uniformTexture();
  const uSource = uniformTexture();
  const uTexelSize = uniform(vec2(1 / 128, 1 / 128));
  const uDt = uniform(0.016);
  const uDissipation = uniform(1.0);

  const node = Fn(() => {
    const baseUV = uv();
    const coord = baseUV.sub(
      uDt.mul(uVelocity.sample(baseUV).xy).mul(uTexelSize),
    );
    const result = uDissipation.mul(uSource.sample(coord));
    return vec4(result.rgb, 1.0);
  })();

  return {
    quad: createPass(node),
    uVelocity,
    uSource,
    uTexelSize,
    uDt,
    uDissipation,
  };
}

function buildCurlPass(uniforms: FluidSimulationUniforms) {
  const uVelocity = uniformTexture();

  const node = Fn(() => {
    const coord = uv();
    const L = uVelocity.sample(
      coord.sub(vec2(uniforms.uSimTexelSize.x, 0.0)),
    ).y;
    const R = uVelocity.sample(
      coord.add(vec2(uniforms.uSimTexelSize.x, 0.0)),
    ).y;
    const T = uVelocity.sample(
      coord.add(vec2(0.0, uniforms.uSimTexelSize.y)),
    ).x;
    const B = uVelocity.sample(
      coord.sub(vec2(0.0, uniforms.uSimTexelSize.y)),
    ).x;
    const vorticity = R.sub(L).sub(T).add(B);
    return vec4(vorticity.mul(0.5), 0.0, 0.0, 1.0);
  })();

  return { quad: createPass(node), uVelocity };
}

function buildVorticityPass(uniforms: FluidSimulationUniforms) {
  const uVelocity = uniformTexture();
  const uCurl = uniformTexture();
  const uDt = uniform(0.016);

  const node = Fn(() => {
    const coord = uv();
    const L = uCurl.sample(coord.sub(vec2(uniforms.uSimTexelSize.x, 0.0))).x;
    const R = uCurl.sample(coord.add(vec2(uniforms.uSimTexelSize.x, 0.0))).x;
    const T = uCurl.sample(coord.add(vec2(0.0, uniforms.uSimTexelSize.y))).x;
    const B = uCurl.sample(coord.sub(vec2(0.0, uniforms.uSimTexelSize.y))).x;
    const C = uCurl.sample(coord).x;

    const force = vec2(abs(T).sub(abs(B)), abs(R).sub(abs(L)))
      .mul(0.5)
      .toVar();
    force.assign(force.div(force.length().add(0.0001)));
    force.assign(force.mul(uniforms.uCurlStrength).mul(C));
    const vel = uVelocity.sample(coord).xy;
    return vec4(vel.add(vec2(force.x, force.y.negate()).mul(uDt)), 0.0, 1.0);
  })();

  return { quad: createPass(node), uVelocity, uCurl, uDt };
}

function buildDivergencePass(uniforms: FluidSimulationUniforms) {
  const uVelocity = uniformTexture();

  const node = Fn(() => {
    const coord = uv();
    const L = uVelocity.sample(
      coord.sub(vec2(uniforms.uSimTexelSize.x, 0.0)),
    ).x;
    const R = uVelocity.sample(
      coord.add(vec2(uniforms.uSimTexelSize.x, 0.0)),
    ).x;
    const T = uVelocity.sample(
      coord.add(vec2(0.0, uniforms.uSimTexelSize.y)),
    ).y;
    const B = uVelocity.sample(
      coord.sub(vec2(0.0, uniforms.uSimTexelSize.y)),
    ).y;
    const div = R.sub(L).add(T).sub(B).mul(0.5);
    return vec4(div, 0.0, 0.0, 1.0);
  })();

  return { quad: createPass(node), uVelocity };
}

function buildPressurePass(uniforms: FluidSimulationUniforms) {
  const uPressure = uniformTexture();
  const uDivergence = uniformTexture();

  const node = Fn(() => {
    const coord = uv();
    const L = uPressure.sample(
      coord.sub(vec2(uniforms.uSimTexelSize.x, 0.0)),
    ).x;
    const R = uPressure.sample(
      coord.add(vec2(uniforms.uSimTexelSize.x, 0.0)),
    ).x;
    const T = uPressure.sample(
      coord.add(vec2(0.0, uniforms.uSimTexelSize.y)),
    ).x;
    const B = uPressure.sample(
      coord.sub(vec2(0.0, uniforms.uSimTexelSize.y)),
    ).x;
    const divergence = uDivergence.sample(coord).x;
    const pressure = L.add(R).add(B).add(T).sub(divergence).mul(0.25);
    return vec4(pressure, 0.0, 0.0, 1.0);
  })();

  return { quad: createPass(node), uPressure, uDivergence };
}

function buildGradientSubtractPass(uniforms: FluidSimulationUniforms) {
  const uPressure = uniformTexture();
  const uVelocity = uniformTexture();

  const node = Fn(() => {
    const coord = uv();
    const L = uPressure.sample(
      coord.sub(vec2(uniforms.uSimTexelSize.x, 0.0)),
    ).x;
    const R = uPressure.sample(
      coord.add(vec2(uniforms.uSimTexelSize.x, 0.0)),
    ).x;
    const T = uPressure.sample(
      coord.add(vec2(0.0, uniforms.uSimTexelSize.y)),
    ).x;
    const B = uPressure.sample(
      coord.sub(vec2(0.0, uniforms.uSimTexelSize.y)),
    ).x;
    const vel = uVelocity.sample(coord).xy;
    return vec4(vel.sub(vec2(R.sub(L), T.sub(B))), 0.0, 1.0);
  })();

  return { quad: createPass(node), uPressure, uVelocity };
}

function buildClearPass() {
  const uTexture = uniformTexture();
  const uValue = uniform(0.8);

  const node = Fn(() => {
    return uValue.mul(uTexture.sample(uv()));
  })();

  return { quad: createPass(node), uTexture, uValue };
}

function setTex(texNode: TextureNode, texture: Texture): void {
  texNode.value = texture;
}

export class FluidSimulation {
  densityTexture: Texture;

  private _renderer: WebGPURenderer | null = null;
  private readonly _cfg: Required<FluidBackgroundOptions>;
  private readonly _uniforms: FluidSimulationUniforms;

  private readonly _density: DoubleFBO;
  private readonly _velocity: DoubleFBO;
  private readonly _pressure: DoubleFBO;
  private readonly _divergence: RenderTarget;
  private readonly _curl: RenderTarget;

  private readonly _splatPass: ReturnType<typeof buildSplatPass>;
  private readonly _splatDyePass: ReturnType<typeof buildSplatDyePass>;
  private readonly _advection: ReturnType<typeof buildAdvectionPass>;
  private readonly _curlPass: ReturnType<typeof buildCurlPass>;
  private readonly _vorticityPass: ReturnType<typeof buildVorticityPass>;
  private readonly _divergencePass: ReturnType<typeof buildDivergencePass>;
  private readonly _pressurePass: ReturnType<typeof buildPressurePass>;
  private readonly _gradientSubtract: ReturnType<
    typeof buildGradientSubtractPass
  >;
  private readonly _clearPass: ReturnType<typeof buildClearPass>;
  private _idleFramesRemaining = 0;

  private static readonly MAX_SPLATS_PER_FRAME = 3;

  constructor(config: FluidBackgroundOptions = {}) {
    this._cfg = { ...DEFAULTS, ...config };
    const { simRes, dyeRes } = this._cfg;
    this._uniforms = createFluidSimulationUniforms(this._cfg);

    this._splatPass = buildSplatPass(this._uniforms);
    this._splatDyePass = buildSplatDyePass(this._uniforms);
    this._advection = buildAdvectionPass();
    this._curlPass = buildCurlPass(this._uniforms);
    this._vorticityPass = buildVorticityPass(this._uniforms);
    this._divergencePass = buildDivergencePass(this._uniforms);
    this._pressurePass = buildPressurePass(this._uniforms);
    this._gradientSubtract = buildGradientSubtractPass(this._uniforms);
    this._clearPass = buildClearPass();

    this._density = createDoubleFBO(dyeRes, dyeRes, RGBAFormat, LinearFilter);
    this._velocity = createDoubleFBO(simRes, simRes, RGFormat, LinearFilter);
    this._pressure = createDoubleFBO(simRes, simRes, RedFormat, NearestFilter);

    const simOpts = {
      type: HalfFloatType,
      format: RedFormat,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: false,
    };
    this._divergence = new RenderTarget(simRes, simRes, simOpts);
    this._curl = new RenderTarget(simRes, simRes, simOpts);

    this.densityTexture = this._density.read.texture;
  }

  init(renderer: WebGPURenderer): void {
    this._renderer = renderer;
  }

  shouldStep(splats: Splat[]): boolean {
    if (splats.length > 0) {
      this._idleFramesRemaining = this._cfg.idleFrames;
      return true;
    }

    if (this._idleFramesRemaining <= 0) return false;
    this._idleFramesRemaining -= 1;
    return true;
  }

  step(splats: Splat[], delta: number): void {
    const renderer = this._renderer;
    if (!renderer) return;

    const { iterations } = this._cfg;
    const aspect = renderer.domElement.width / renderer.domElement.height;
    const dt = Math.min(Math.max(delta, 0.001), 0.05);

    const capped =
      splats.length > FluidSimulation.MAX_SPLATS_PER_FRAME
        ? splats.slice(-FluidSimulation.MAX_SPLATS_PER_FRAME)
        : splats;

    for (const splat of capped) {
      setTex(this._splatPass.uTarget, this._velocity.read.texture);
      this._splatPass.uAspect.value = aspect;
      this._splatPass.uPoint.value.set(splat.x, splat.y);
      this._splatPass.uColor.value.set(splat.dx, splat.dy);
      this._renderPass(this._splatPass.quad, this._velocity.write);
      this._velocity.swap();

      setTex(this._splatDyePass.uTarget, this._density.read.texture);
      this._splatDyePass.uAspect.value = aspect;
      this._splatDyePass.uPoint.value.set(splat.x, splat.y);
      this._splatDyePass.uColor.value.set(splat.dx, splat.dy);
      this._renderPass(this._splatDyePass.quad, this._density.write);
      this._density.swap();
    }

    setTex(this._curlPass.uVelocity, this._velocity.read.texture);
    this._renderPass(this._curlPass.quad, this._curl);

    setTex(this._vorticityPass.uVelocity, this._velocity.read.texture);
    setTex(this._vorticityPass.uCurl, this._curl.texture);
    this._vorticityPass.uDt.value = dt;
    this._renderPass(this._vorticityPass.quad, this._velocity.write);
    this._velocity.swap();

    setTex(this._divergencePass.uVelocity, this._velocity.read.texture);
    this._renderPass(this._divergencePass.quad, this._divergence);

    setTex(this._clearPass.uTexture, this._pressure.read.texture);
    this._clearPass.uValue.value = this._uniforms.uPressureDissipation.value;
    this._renderPass(this._clearPass.quad, this._pressure.write);
    this._pressure.swap();

    setTex(this._pressurePass.uDivergence, this._divergence.texture);
    for (let i = 0; i < iterations; i++) {
      setTex(this._pressurePass.uPressure, this._pressure.read.texture);
      this._renderPass(this._pressurePass.quad, this._pressure.write);
      this._pressure.swap();
    }

    setTex(this._gradientSubtract.uPressure, this._pressure.read.texture);
    setTex(this._gradientSubtract.uVelocity, this._velocity.read.texture);
    this._renderPass(this._gradientSubtract.quad, this._velocity.write);
    this._velocity.swap();

    this._advection.uTexelSize.value.set(
      this._uniforms.uSimTexelSize.value.x,
      this._uniforms.uSimTexelSize.value.y,
    );
    this._advection.uDt.value = dt;
    setTex(this._advection.uVelocity, this._velocity.read.texture);
    setTex(this._advection.uSource, this._velocity.read.texture);
    this._advection.uDissipation.value =
      this._uniforms.uVelocityDissipation.value;
    this._renderPass(this._advection.quad, this._velocity.write);
    this._velocity.swap();

    setTex(this._advection.uVelocity, this._velocity.read.texture);
    setTex(this._advection.uSource, this._density.read.texture);
    this._advection.uDissipation.value =
      this._uniforms.uDensityDissipation.value;
    this._renderPass(this._advection.quad, this._density.write);
    this._density.swap();

    this.densityTexture = this._density.read.texture;
    renderer.setRenderTarget(null);
  }

  dispose(): void {
    this._density.read.dispose();
    this._density.write.dispose();
    this._velocity.read.dispose();
    this._velocity.write.dispose();
    this._pressure.read.dispose();
    this._pressure.write.dispose();
    this._divergence.dispose();
    this._curl.dispose();

    this._disposeQuadPass(this._splatPass.quad);
    this._disposeQuadPass(this._splatDyePass.quad);
    this._disposeQuadPass(this._advection.quad);
    this._disposeQuadPass(this._curlPass.quad);
    this._disposeQuadPass(this._vorticityPass.quad);
    this._disposeQuadPass(this._divergencePass.quad);
    this._disposeQuadPass(this._pressurePass.quad);
    this._disposeQuadPass(this._gradientSubtract.quad);
    this._disposeQuadPass(this._clearPass.quad);
  }

  private _renderPass(quad: QuadMesh, target: RenderTarget): void {
    if (!this._renderer) return;
    this._renderer.setRenderTarget(target);
    quad.render(this._renderer);
  }

  private _disposeQuadPass(quad: QuadMesh): void {
    try {
      disposeMaterial(quad.material);
    } catch {
      /* Pass materials can fail disposal before first WebGPU compilation. */
    }
  }
}
