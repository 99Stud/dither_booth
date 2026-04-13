import {
  HalfFloatType,
  LinearFilter,
  NearestFilter,
  RGBAFormat,
  RGFormat,
  RedFormat,
  RenderTarget,
} from "three";
import type { Texture, MagnificationTextureFilter, PixelFormat } from "three";
import { abs, float, Fn, uniform, uniformTexture, uv, vec2, vec4 } from "three/tsl";
import type { Node, TextureNode, WebGPURenderer } from "three/webgpu";
import { NodeMaterial, QuadMesh } from "three/webgpu";
import type { Splat } from "./pointer.ts";
import { FLUID } from "../hudBackground.config.ts";

interface DoubleFBO {
  read: RenderTarget;
  write: RenderTarget;
  swap(): void;
}

const uDensityDissipation = uniform(FLUID.densityDissipation);
const uVelocityDissipation = uniform(FLUID.velocityDissipation);
const uPressureDissipation = uniform(FLUID.pressureDissipation);
const uCurlStrength = uniform(FLUID.curlStrength);
const uSplatRadius = uniform(FLUID.splatRadius);

function createDoubleFBO(
  width: number,
  height: number,
  format: PixelFormat,
  filter: MagnificationTextureFilter,
): DoubleFBO {
  const opts = { type: HalfFloatType, format, minFilter: filter, magFilter: filter, depthBuffer: false };
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

function buildSplatPass() {
  const uTarget = uniformTexture();
  const uAspect = uniform(1);
  const uPoint = uniform(vec2(0, 0));
  const uColor = uniform(vec2(0, 0));

  const node = Fn(() => {
    const coord = uv();
    const p = coord.sub(uPoint).toVar();
    p.x.mulAssign(uAspect);
    const radius = uSplatRadius.div(100);
    const splat = uColor.mul(float(-1).mul(p.dot(p)).div(radius).exp());
    const base = uTarget.sample(coord);
    return vec4(base.rg.add(splat), 0.0, 1.0);
  })();

  return { quad: createPass(node), uTarget, uAspect, uPoint, uColor };
}

function buildSplatDyePass() {
  const uTarget = uniformTexture();
  const uAspect = uniform(1);
  const uPoint = uniform(vec2(0, 0));
  const uColor = uniform(vec2(0, 0));

  const node = Fn(() => {
    const coord = uv();
    const p = coord.sub(uPoint).toVar();
    p.x.mulAssign(uAspect);
    const radius = uSplatRadius.div(100);
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
    const coord = uv().sub(uDt.mul(uVelocity.sample(uv()).xy).mul(uTexelSize));
    const result = uDissipation.mul(uSource.sample(coord));
    return vec4(result.rgb, 1.0);
  })();

  return { quad: createPass(node), uVelocity, uSource, uTexelSize, uDt, uDissipation };
}

const uSimTexelSize = uniform(vec2(1 / 128, 1 / 128));

function buildCurlPass() {
  const uVelocity = uniformTexture();

  const node = Fn(() => {
    const coord = uv();
    const L = uVelocity.sample(coord.sub(vec2(uSimTexelSize.x, 0.0))).y;
    const R = uVelocity.sample(coord.add(vec2(uSimTexelSize.x, 0.0))).y;
    const T = uVelocity.sample(coord.add(vec2(0.0, uSimTexelSize.y))).x;
    const B = uVelocity.sample(coord.sub(vec2(0.0, uSimTexelSize.y))).x;
    const vorticity = R.sub(L).sub(T).add(B);
    return vec4(vorticity.mul(0.5), 0.0, 0.0, 1.0);
  })();

  return { quad: createPass(node), uVelocity };
}

function buildVorticityPass() {
  const uVelocity = uniformTexture();
  const uCurl = uniformTexture();
  const uDt = uniform(0.016);

  const node = Fn(() => {
    const coord = uv();
    const L = uCurl.sample(coord.sub(vec2(uSimTexelSize.x, 0.0))).x;
    const R = uCurl.sample(coord.add(vec2(uSimTexelSize.x, 0.0))).x;
    const T = uCurl.sample(coord.add(vec2(0.0, uSimTexelSize.y))).x;
    const B = uCurl.sample(coord.sub(vec2(0.0, uSimTexelSize.y))).x;
    const C = uCurl.sample(coord).x;

    const force = vec2(abs(T).sub(abs(B)), abs(R).sub(abs(L))).mul(0.5).toVar();
    force.assign(force.div(force.length().add(0.0001)));
    force.assign(force.mul(uCurlStrength).mul(C));
    const vel = uVelocity.sample(coord).xy;
    return vec4(vel.add(vec2(force.x, force.y.negate()).mul(uDt)), 0.0, 1.0);
  })();

  return { quad: createPass(node), uVelocity, uCurl, uDt };
}

function buildDivergencePass() {
  const uVelocity = uniformTexture();

  const node = Fn(() => {
    const coord = uv();
    const L = uVelocity.sample(coord.sub(vec2(uSimTexelSize.x, 0.0))).x;
    const R = uVelocity.sample(coord.add(vec2(uSimTexelSize.x, 0.0))).x;
    const T = uVelocity.sample(coord.add(vec2(0.0, uSimTexelSize.y))).y;
    const B = uVelocity.sample(coord.sub(vec2(0.0, uSimTexelSize.y))).y;
    const div = R.sub(L).add(T).sub(B).mul(0.5);
    return vec4(div, 0.0, 0.0, 1.0);
  })();

  return { quad: createPass(node), uVelocity };
}

function buildPressurePass() {
  const uPressure = uniformTexture();
  const uDivergence = uniformTexture();

  const node = Fn(() => {
    const coord = uv();
    const L = uPressure.sample(coord.sub(vec2(uSimTexelSize.x, 0.0))).x;
    const R = uPressure.sample(coord.add(vec2(uSimTexelSize.x, 0.0))).x;
    const T = uPressure.sample(coord.add(vec2(0.0, uSimTexelSize.y))).x;
    const B = uPressure.sample(coord.sub(vec2(0.0, uSimTexelSize.y))).x;
    const divergence = uDivergence.sample(coord).x;
    const pressure = L.add(R).add(B).add(T).sub(divergence).mul(0.25);
    return vec4(pressure, 0.0, 0.0, 1.0);
  })();

  return { quad: createPass(node), uPressure, uDivergence };
}

function buildGradientSubtractPass() {
  const uPressure = uniformTexture();
  const uVelocity = uniformTexture();

  const node = Fn(() => {
    const coord = uv();
    const L = uPressure.sample(coord.sub(vec2(uSimTexelSize.x, 0.0))).x;
    const R = uPressure.sample(coord.add(vec2(uSimTexelSize.x, 0.0))).x;
    const T = uPressure.sample(coord.add(vec2(0.0, uSimTexelSize.y))).x;
    const B = uPressure.sample(coord.sub(vec2(0.0, uSimTexelSize.y))).x;
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

function setTex(texNode: TextureNode, t: Texture): void {
  texNode.value = t;
}

export class FluidSimulation {
  densityTexture: Texture;

  private _renderer!: WebGPURenderer;
  private _iterations: number;

  private _density: DoubleFBO;
  private _velocity: DoubleFBO;
  private _pressure: DoubleFBO;
  private _divergence: RenderTarget;
  private _curl: RenderTarget;

  private _splatPass = buildSplatPass();
  private _splatDyePass = buildSplatDyePass();
  private _advection = buildAdvectionPass();
  private _curlPass = buildCurlPass();
  private _vorticityPass = buildVorticityPass();
  private _divergencePass = buildDivergencePass();
  private _pressurePass = buildPressurePass();
  private _gradientSubtract = buildGradientSubtractPass();
  private _clearPass = buildClearPass();

  constructor() {
    const { simRes, dyeRes, iterations } = FLUID;
    this._iterations = iterations;

    const rcpSim = 1 / simRes;
    uSimTexelSize.value.set(rcpSim, rcpSim);

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

  step(splats: Splat[]): void {
    const aspect = this._renderer.domElement.width / this._renderer.domElement.height;

    for (const s of splats) {
      setTex(this._splatPass.uTarget, this._velocity.read.texture);
      this._splatPass.uAspect.value = aspect;
      this._splatPass.uPoint.value.set(s.x, s.y);
      this._splatPass.uColor.value.set(s.dx, s.dy);
      this._renderPass(this._splatPass.quad, this._velocity.write);
      this._velocity.swap();

      setTex(this._splatDyePass.uTarget, this._density.read.texture);
      this._splatDyePass.uAspect.value = aspect;
      this._splatDyePass.uPoint.value.set(s.x, s.y);
      this._splatDyePass.uColor.value.set(s.dx, s.dy);
      this._renderPass(this._splatDyePass.quad, this._density.write);
      this._density.swap();
    }

    setTex(this._curlPass.uVelocity, this._velocity.read.texture);
    this._renderPass(this._curlPass.quad, this._curl);

    setTex(this._vorticityPass.uVelocity, this._velocity.read.texture);
    setTex(this._vorticityPass.uCurl, this._curl.texture);
    this._renderPass(this._vorticityPass.quad, this._velocity.write);
    this._velocity.swap();

    setTex(this._divergencePass.uVelocity, this._velocity.read.texture);
    this._renderPass(this._divergencePass.quad, this._divergence);

    setTex(this._clearPass.uTexture, this._pressure.read.texture);
    this._clearPass.uValue.value = uPressureDissipation.value;
    this._renderPass(this._clearPass.quad, this._pressure.write);
    this._pressure.swap();

    setTex(this._pressurePass.uDivergence, this._divergence.texture);
    for (let i = 0; i < this._iterations; i++) {
      setTex(this._pressurePass.uPressure, this._pressure.read.texture);
      this._renderPass(this._pressurePass.quad, this._pressure.write);
      this._pressure.swap();
    }

    setTex(this._gradientSubtract.uPressure, this._pressure.read.texture);
    setTex(this._gradientSubtract.uVelocity, this._velocity.read.texture);
    this._renderPass(this._gradientSubtract.quad, this._velocity.write);
    this._velocity.swap();

    this._advection.uTexelSize.value.set(uSimTexelSize.value.x, uSimTexelSize.value.y);
    setTex(this._advection.uVelocity, this._velocity.read.texture);
    setTex(this._advection.uSource, this._velocity.read.texture);
    this._advection.uDissipation.value = uVelocityDissipation.value;
    this._renderPass(this._advection.quad, this._velocity.write);
    this._velocity.swap();

    setTex(this._advection.uVelocity, this._velocity.read.texture);
    setTex(this._advection.uSource, this._density.read.texture);
    this._advection.uDissipation.value = uDensityDissipation.value;
    this._renderPass(this._advection.quad, this._density.write);
    this._density.swap();

    this.densityTexture = this._density.read.texture;

    this._renderer.setRenderTarget(null);
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
  }

  private _renderPass(quad: QuadMesh, target: RenderTarget): void {
    this._renderer.setRenderTarget(target);
    quad.render(this._renderer);
  }
}
