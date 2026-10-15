import type { Node, TextureNode } from "three/webgpu";

import {
  abs,
  color,
  float,
  floor,
  Fn,
  fract,
  hash,
  length,
  max,
  mix,
  mod,
  mx_noise_float,
  normalize,
  pow,
  screenSize,
  smoothstep,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

import type { SmokeSettings } from "../smoke-background.types";

const WARP_OCTAVES = 4;
const TURBULENCE_OCTAVES = 5;

export function createSmokeState(settings: SmokeSettings) {
  return {
    uScale: uniform(settings.scale),
    uSpeed: uniform(settings.speed),
    uDrift: uniform(vec2(...settings.drift)),
    uWarp: uniform(settings.warp),
    uTurbulence: uniform(settings.turbulence),
    uLacunarity: uniform(settings.lacunarity),
    uGain: uniform(settings.gain),
    uRise: uniform(settings.rise),
    uFluidStrength: uniform(settings.fluidStrength),
    uThreshold: uniform(settings.threshold),
    uSoftness: uniform(settings.softness),
    uSmudge: uniform(settings.smudge),
    uHaze: uniform(settings.haze),
    uGrit: uniform(settings.grit),
    uGrain: uniform(settings.grain),
    uGrainSize: uniform(settings.grainSize),
    uGrainFps: uniform(settings.grainFps),
    uEdgeWidth: uniform(settings.edgeWidth),
    uEdgeStrength: uniform(settings.edgeStrength),
    uFresnelPower: uniform(settings.fresnelPower),
    uEdgeGrain: uniform(settings.edgeGrain),
    uDotSize: uniform(settings.dotSize),
    uDotDensity: uniform(settings.dotDensity),
    uDust: uniform(settings.dust),
    uPaperColor: uniform(color(settings.paperColor)),
    uInkColor: uniform(color(settings.inkColor)),
    uPaperTooth: uniform(settings.paperTooth),
    uFieldTexel: uniform(vec2(1 / 512, 1 / 512)),
  };
}

export type SmokeState = ReturnType<typeof createSmokeState>;

/**
 * Low-res pass: domain-warped fbm masses carved by turbulence noise.
 * R stores density, G a slow smudge value used to mottle the charcoal tone.
 */
export function buildSmokeFieldNode(fluidTex: TextureNode, state: SmokeState) {
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
  } = state;

  const fbm = (p: Node<"vec3">) => {
    const sum = float(0.0).toVar();
    let freq: Node<"float"> = float(1.0);
    let amp: Node<"float"> = float(0.5);
    for (let o = 0; o < WARP_OCTAVES; o++) {
      sum.addAssign(mx_noise_float(p.mul(freq)).mul(amp));
      freq = freq.mul(uLacunarity);
      amp = amp.mul(uGain);
    }
    return sum;
  };

  const turbulence = (p: Node<"vec3">) => {
    const sum = float(0.0).toVar();
    let freq: Node<"float"> = float(1.0);
    let amp: Node<"float"> = float(0.5);
    for (let o = 0; o < TURBULENCE_OCTAVES; o++) {
      sum.addAssign(abs(mx_noise_float(p.mul(freq))).mul(amp));
      freq = freq.mul(uLacunarity);
      amp = amp.mul(uGain);
    }
    return sum;
  };

  return Fn(() => {
    const baseUV = uv();
    const aspect = screenSize.x.div(screenSize.y);
    const t = time.mul(uSpeed);

    const fluid = fluidTex.sample(baseUV).rg.mul(uFluidStrength);
    const p = baseUV
      .sub(0.5)
      .mul(vec2(aspect, 1.0))
      .mul(uScale)
      .sub(uDrift.mul(t))
      .sub(fluid);

    const q = vec2(
      fbm(vec3(p, t.mul(0.5))),
      fbm(vec3(p.add(vec2(5.2, 1.3)), t.mul(0.5))),
    );
    const warped = p.add(q.mul(uWarp));
    const r = vec2(
      fbm(vec3(warped.add(vec2(1.7, 9.2)), t.mul(0.8))),
      fbm(vec3(warped.add(vec2(8.3, 2.8)), t.mul(0.8))),
    );

    const mass = fbm(vec3(p.add(r.mul(uWarp)), t)).add(0.5);
    const billows = turbulence(vec3(warped.add(r).mul(1.6), t.mul(1.4)));
    const rise = float(0.5).sub(baseUV.y).mul(uRise);
    const density = mass
      .add(billows.sub(0.25).mul(uTurbulence))
      .add(rise)
      .clamp(0.0, 1.0);

    return vec4(density, q.x.mul(0.5).add(0.5), 0.0, 1.0);
  })();
}

/**
 * Full-res pass: thresholds the field into charcoal, then scatters grain and
 * dots along a fresnel term taken from the silhouette's height-field normal.
 */
export function buildSmokeCharcoalNode(
  fieldTex: TextureNode,
  state: SmokeState,
) {
  const {
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
    uFieldTexel,
  } = state;

  const coverage = (coord: Node<"vec2">) =>
    smoothstep(
      uThreshold.sub(uSoftness),
      uThreshold.add(uSoftness),
      fieldTex.sample(coord).r,
    );

  return Fn(() => {
    const baseUV = uv();
    const field = fieldTex.sample(baseUV);
    const cov = coverage(baseUV);

    const offset = uFieldTexel.mul(uEdgeWidth);
    const gx = coverage(baseUV.add(vec2(offset.x, 0.0))).sub(
      coverage(baseUV.sub(vec2(offset.x, 0.0))),
    );
    const gy = coverage(baseUV.add(vec2(0.0, offset.y))).sub(
      coverage(baseUV.sub(vec2(0.0, offset.y))),
    );
    const normal = normalize(vec3(vec2(gx, gy).mul(uEdgeStrength).negate(), 1));
    const fresnel = pow(float(1.0).sub(normal.z), uFresnelPower);

    const frame = mod(floor(time.mul(uGrainFps)), 61.0);
    const px = baseUV
      .mul(screenSize)
      .add(vec2(frame.mul(37.0), frame.mul(17.0)));

    const grainCell = floor(px.div(uGrainSize));
    const grainClump = mx_noise_float(px.div(uGrainSize.mul(3.0)));
    const grain = hash(grainCell.x.add(grainCell.y.mul(4099.0)))
      .mul(0.5)
      .add(grainClump.mul(0.35))
      .add(0.25);

    const haze = smoothstep(
      uThreshold.sub(uSoftness.mul(4.0)),
      uThreshold,
      field.r,
    ).mul(uHaze);
    const tone = max(cov.mul(mix(float(1.0), field.g, uSmudge)), haze);
    const jitter = grain.sub(0.5).mul(uGrain.add(fresnel.mul(uEdgeGrain)));
    const ink = smoothstep(0.45, 0.55, tone.add(jitter));
    const darkness = mix(tone, ink, uGrit).toVar();

    const dotCell = floor(px.div(uDotSize));
    const dotSeed = dotCell.x.add(dotCell.y.mul(1031.0)).mul(4.0);
    const dotCenter = vec2(hash(dotSeed), hash(dotSeed.add(1.0)))
      .mul(0.5)
      .add(0.25);
    const dotRadius = hash(dotSeed.add(2.0)).mul(0.25).add(0.15);
    const dotDist = length(fract(px.div(uDotSize)).sub(dotCenter));
    const dotMask = smoothstep(dotRadius, dotRadius.sub(0.08), dotDist);
    const dotChance = fresnel.mul(uDotDensity).add(uDust);
    const dotOn = hash(dotSeed.add(3.0))
      .lessThan(dotChance)
      .select(dotMask, float(0.0));
    darkness.assign(mix(darkness, float(1.0).sub(darkness), dotOn));

    const tooth = mx_noise_float(px.mul(0.35)).mul(uPaperTooth);
    const paper = uPaperColor.mul(float(1.0).sub(tooth));
    return mix(paper, uInkColor, darkness);
  })();
}
