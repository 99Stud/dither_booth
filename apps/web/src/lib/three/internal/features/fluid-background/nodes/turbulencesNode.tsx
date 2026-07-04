import type { TextureNode } from "three/webgpu";

import { DataTexture, FloatType, LinearFilter, RGBAFormat } from "three";
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

const LUT_SIZE = 64;

function smoothstepCPU(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerpCPU(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const RCP_D0 = 1.0 / 0.6;
const RCP_D1 = 1.0 / 1.6;

export function createTurbulenceState() {
  const state = {
    cScale: uniform(0.4),
    cIntensity: uniform(0.07),
    uSinSpeed: uniform(0.1),
    uOverallSpeed: uniform(0.15),
    uDirection: uniform(vec2(1.0, 0.44)),
    uFluidStrength: uniform(0.0002),
    uColor0: uniform(color("#000000")),
    uColor1: uniform(color("#1a0a2e")),
    uColor2: uniform(color("#9d1515")),
    uColor3: uniform(color("#e81717")),
    uColor4: uniform(color("#bd6800")),
    uColor5: uniform(color("#ff6666")),
    uStop1: uniform(0.15),
    uStop2: uniform(0.35),
    uStop3: uniform(0.55),
    uStop4: uniform(0.87),
    uRcpIntensity: uniform(1.0 / 0.07),
    uColorRampLUT: uniformTexture(),
  };

  const rampData = new Float32Array(LUT_SIZE * 4);
  const rampTexture = new DataTexture(
    rampData,
    LUT_SIZE,
    1,
    RGBAFormat,
    FloatType,
  );
  rampTexture.minFilter = LinearFilter;
  rampTexture.magFilter = LinearFilter;

  function rebuildColorRampLUT(): void {
    const s1 = state.uStop1.value;
    const s2 = state.uStop2.value;
    const s3 = state.uStop3.value;
    const s4 = state.uStop4.value;
    const color0 = state.uColor0.value;
    const color1 = state.uColor1.value;
    const color2 = state.uColor2.value;
    const color3 = state.uColor3.value;
    const color4 = state.uColor4.value;
    const color5 = state.uColor5.value;

    for (let i = 0; i < LUT_SIZE; i++) {
      const t = i / (LUT_SIZE - 1);

      const f1 = smoothstepCPU(0, s1, t);
      let r = lerpCPU(color0.r, color1.r, f1);
      let g = lerpCPU(color0.g, color1.g, f1);
      let b = lerpCPU(color0.b, color1.b, f1);

      const f2 = smoothstepCPU(s1, s2, t);
      r = lerpCPU(r, color2.r, f2);
      g = lerpCPU(g, color2.g, f2);
      b = lerpCPU(b, color2.b, f2);

      const f3 = smoothstepCPU(s2, s3, t);
      r = lerpCPU(r, color3.r, f3);
      g = lerpCPU(g, color3.g, f3);
      b = lerpCPU(b, color3.b, f3);

      const f4 = smoothstepCPU(s3, s4, t);
      r = lerpCPU(r, color4.r, f4);
      g = lerpCPU(g, color4.g, f4);
      b = lerpCPU(b, color4.b, f4);

      const f5 = smoothstepCPU(s4, 1.0, t);
      r = lerpCPU(r, color5.r, f5);
      g = lerpCPU(g, color5.g, f5);
      b = lerpCPU(b, color5.b, f5);

      const idx = i * 4;
      rampData[idx] = r;
      rampData[idx + 1] = g;
      rampData[idx + 2] = b;
      rampData[idx + 3] = 1.0;
    }

    rampTexture.needsUpdate = true;
    state.uColorRampLUT.value = rampTexture;
  }

  rebuildColorRampLUT();

  return {
    ...state,
    rebuildColorRampLUT,
    dispose: () => rampTexture.dispose(),
  };
}

export type TurbulenceState = ReturnType<typeof createTurbulenceState>;

export function buildTurbulencesNode(
  fluidTex: TextureNode,
  state: TurbulenceState,
) {
  const {
    cScale,
    uSinSpeed,
    uOverallSpeed,
    uDirection,
    uFluidStrength,
    uRcpIntensity,
    uColorRampLUT,
  } = state;

  return Fn(() => {
    const baseUV = uv();
    const fluidSample = fluidTex.sample(baseUV).rgb;
    const displacement = fluidSample.mul(uFluidStrength);
    const position = baseUV.sub(vec2(displacement.x, displacement.y));
    const p = position.mul(mix(2.0, 15.0, cScale));
    const sinPhase = time.mul(uSinSpeed);
    const sinT = sin(sinPhase);
    const cosT = cos(sinPhase.add(1.5));
    const r = length(
      p.add(
        uDirection.mul(time.mul(uOverallSpeed)).add(vec2(sinT, cosT).mul(0.5)),
      ),
    ).toVar();

    const i = p.toVar();
    const c = float(0.0).toVar();

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
          length(
            vec2(
              sin(i.x.add(t)).mul(uRcpIntensity),
              cos(i.y.add(t)).mul(uRcpIntensity),
            ),
          ),
        ),
      );
    }

    c.divAssign(4.0);

    const t = smoothstep(0.0, 0.1, clamp(c, -1.0, 1.0));
    return uColorRampLUT.sample(vec2(t, 0.5)).rgb;
  })();
}
