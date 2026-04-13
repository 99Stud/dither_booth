import {
  clamp,
  color,
  cos,
  float,
  Fn,
  length,
  mix,
  sin,
  smoothstep,
  time,
  uniform,
  uniformTexture,
  uv,
  vec2,
} from "three/tsl";
import type { Node, TextureNode } from "three/webgpu";
import { DataTexture, FloatType, LinearFilter, RGBAFormat } from "three";
import { TURBULENCE, PALETTE, COLOR_STOPS } from "../hudBackground.config.ts";

const cScale = uniform(TURBULENCE.scale);
const cIntensity = uniform(TURBULENCE.intensity);
const uSinSpeed = uniform(TURBULENCE.sinSpeed);
const uOverallSpeed = uniform(TURBULENCE.overallSpeed);
const uDirection = uniform(vec2(TURBULENCE.directionX, TURBULENCE.directionY));

const uColor0 = uniform(color(PALETTE.color0));
const uColor1 = uniform(color(PALETTE.color1));
const uColor2 = uniform(color(PALETTE.color2));
const uColor3 = uniform(color(PALETTE.color3));
const uColor4 = uniform(color(PALETTE.color4));
const uColor5 = uniform(color(PALETTE.color5));

const uStop1 = uniform(COLOR_STOPS.stop1);
const uStop2 = uniform(COLOR_STOPS.stop2);
const uStop3 = uniform(COLOR_STOPS.stop3);
const uStop4 = uniform(COLOR_STOPS.stop4);

const LUT_SIZE = 64;
const uColorRampLUT: TextureNode = uniformTexture();

const _rampData = new Float32Array(LUT_SIZE * 4);
const _rampTexture = new DataTexture(_rampData, LUT_SIZE, 1, RGBAFormat, FloatType);
_rampTexture.minFilter = LinearFilter;
_rampTexture.magFilter = LinearFilter;

function smoothstepCPU(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerpCPU(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function rebuildColorRampLUT(): void {
  const s1 = uStop1.value;
  const s2 = uStop2.value;
  const s3 = uStop3.value;
  const s4 = uStop4.value;
  const colors = [uColor0, uColor1, uColor2, uColor3, uColor4, uColor5].map((u) => ({
    r: u.value.r,
    g: u.value.g,
    b: u.value.b,
  }));

  for (let i = 0; i < LUT_SIZE; i++) {
    const t = i / (LUT_SIZE - 1);
    const c0 = colors[0]!;
    const c1 = colors[1]!;
    const c2 = colors[2]!;
    const c3 = colors[3]!;
    const c4 = colors[4]!;
    const c5 = colors[5]!;

    const f1 = smoothstepCPU(0, s1, t);
    let r = lerpCPU(c0.r, c1.r, f1);
    let g = lerpCPU(c0.g, c1.g, f1);
    let b = lerpCPU(c0.b, c1.b, f1);

    const f2 = smoothstepCPU(s1, s2, t);
    r = lerpCPU(r, c2.r, f2);
    g = lerpCPU(g, c2.g, f2);
    b = lerpCPU(b, c2.b, f2);

    const f3 = smoothstepCPU(s2, s3, t);
    r = lerpCPU(r, c3.r, f3);
    g = lerpCPU(g, c3.g, f3);
    b = lerpCPU(b, c3.b, f3);

    const f4 = smoothstepCPU(s3, s4, t);
    r = lerpCPU(r, c4.r, f4);
    g = lerpCPU(g, c4.g, f4);
    b = lerpCPU(b, c4.b, f4);

    const f5 = smoothstepCPU(s4, 1.0, t);
    r = lerpCPU(r, c5.r, f5);
    g = lerpCPU(g, c5.g, f5);
    b = lerpCPU(b, c5.b, f5);

    const idx = i * 4;
    _rampData[idx] = r;
    _rampData[idx + 1] = g;
    _rampData[idx + 2] = b;
    _rampData[idx + 3] = 1.0;
  }

  _rampTexture.needsUpdate = true;
  uColorRampLUT.value = _rampTexture;
}

rebuildColorRampLUT();

const RCP_D0 = 1.0 / 0.6;
const RCP_D1 = 1.0 / 1.6;

export function buildTurbulencesNode(fluidTex: TextureNode, fluidStrength: Node<"float">) {
  return Fn(() => {
    const fluidSample = fluidTex.sample(uv()).rgb;
    const displacement = fluidSample.mul(fluidStrength);
    const position = uv().sub(vec2(displacement.x, displacement.y));
    const p = position.mul(mix(2.0, 15.0, cScale));
    const sinT = sin(time.mul(uSinSpeed));
    const r = length(
      p
        .add(uDirection.mul(time.mul(uOverallSpeed)))
        .add(vec2(sinT, sin(time.mul(uSinSpeed).add(1.5))).mul(0.5)),
    ).toVar();

    const i = p.toVar();
    const c = float(0.0).toVar();
    const rcpIntensity = float(1.0).div(cIntensity);

    for (const rcp of [RCP_D0, RCP_D1]) {
      const t = r.sub(time.mul(rcp)).mul(uOverallSpeed);

      i.subAssign(
        p.add(
          vec2(
            cos(t.sub(i.x).sub(r)).add(sin(t.add(i.y))),
            sin(t.sub(i.y)).add(cos(t.add(i.x)).add(r)),
          ),
        ),
      );

      c.addAssign(
        float(1.0).div(
          length(vec2(sin(i.x.add(t)).mul(rcpIntensity), cos(i.y.add(t)).mul(rcpIntensity))),
        ),
      );
    }

    c.divAssign(4.0);

    const t = smoothstep(0.0, 0.1, clamp(c, -1.0, 1.0));
    return uColorRampLUT.sample(vec2(t, 0.5)).rgb;
  })();
}
