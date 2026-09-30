import type { Node } from "three/webgpu";

import {
  abs,
  convertToTexture,
  exp2,
  float,
  floor,
  Fn,
  fract,
  mix,
  pow,
  screenSize,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

import type {
  PostProcessingEffect,
  PostProcessingEffectNode,
} from "../postProcessing.types";

type CrtInputNode = PostProcessingEffectNode;
type ScalarNode = Node<"float">;
type Vector2Node = Node<"vec2">;

function createCrtUniforms() {
  return {
    uWarpX: uniform(0.011),
    uWarpY: uniform(0.021),
    uHardScan: uniform(-8.0),
    uHardPix: uniform(-3.0),
    uMaskDark: uniform(0.5),
    uMaskLight: uniform(1.5),
    uBrightBoost: uniform(1.0),
    uShape: uniform(2.0),
    uVignette: uniform(0.3),
  };
}

function crtNode(
  inputNode: CrtInputNode,
  uniforms: ReturnType<typeof createCrtUniforms>,
) {
  const {
    uWarpX,
    uWarpY,
    uHardScan,
    uHardPix,
    uMaskDark,
    uMaskLight,
    uBrightBoost,
    uShape,
    uVignette,
  } = uniforms;

  const gaus = Fn(
    ([pos_immutable, scale_immutable]: [ScalarNode, ScalarNode]) => {
      const pos = float(pos_immutable);
      const scale = float(scale_immutable);
      return exp2(scale.mul(pow(abs(pos), uShape)));
    },
  );

  const warp = Fn(([coord_immutable]: [Vector2Node]) => {
    const p = coord_immutable.toVec2().mul(2.0).sub(1.0).toVar();
    p.assign(
      vec2(
        p.x.mul(float(1.0).add(p.y.mul(p.y).mul(uWarpX))),
        p.y.mul(float(1.0).add(p.x.mul(p.x).mul(uWarpY))),
      ),
    );
    return p.mul(0.5).add(0.5);
  });

  const tex = convertToTexture(inputNode);

  return Fn(() => {
    const rawUV = uv();
    const warpedUV = warp(rawUV).toVar();
    const res = screenSize.toVec2();

    const fetch_ = Fn(
      ([pos_immutable, off_immutable]: [Vector2Node, Vector2Node]) => {
        const pos = pos_immutable.toVec2();
        const off = off_immutable.toVec2();
        const snapped = floor(pos.mul(res).add(off)).add(0.5).div(res);
        return tex.sample(snapped).rgb.mul(uBrightBoost);
      },
    );

    const dist = Fn(([pos_immutable]: [Vector2Node]) => {
      const pos = pos_immutable.toVec2();
      const p = pos.mul(res);
      return p.sub(floor(p)).sub(0.5).negate();
    });

    const horz3 = Fn(
      ([pos_immutable, off_immutable]: [Vector2Node, ScalarNode]) => {
        const pos = pos_immutable.toVec2();
        const off = float(off_immutable);
        const b = fetch_(pos, vec2(-1.0, off));
        const c = fetch_(pos, vec2(0.0, off));
        const d = fetch_(pos, vec2(1.0, off));
        const dst = dist(pos).x;
        const wb = gaus(dst.sub(1.0), uHardPix);
        const wc = gaus(dst, uHardPix);
        const wd = gaus(dst.add(1.0), uHardPix);
        return b.mul(wb).add(c.mul(wc)).add(d.mul(wd)).div(wb.add(wc).add(wd));
      },
    );

    const horz5 = Fn(
      ([pos_immutable, off_immutable]: [Vector2Node, ScalarNode]) => {
        const pos = pos_immutable.toVec2();
        const off = float(off_immutable);
        const a = fetch_(pos, vec2(-2.0, off));
        const b = fetch_(pos, vec2(-1.0, off));
        const c = fetch_(pos, vec2(0.0, off));
        const d = fetch_(pos, vec2(1.0, off));
        const e = fetch_(pos, vec2(2.0, off));
        const dst = dist(pos).x;
        const wa = gaus(dst.sub(2.0), uHardPix);
        const wb = gaus(dst.sub(1.0), uHardPix);
        const wc = gaus(dst, uHardPix);
        const wd = gaus(dst.add(1.0), uHardPix);
        const we = gaus(dst.add(2.0), uHardPix);
        return a
          .mul(wa)
          .add(b.mul(wb))
          .add(c.mul(wc))
          .add(d.mul(wd))
          .add(e.mul(we))
          .div(wa.add(wb).add(wc).add(wd).add(we));
      },
    );

    const scan = Fn(
      ([pos_immutable, off_immutable]: [Vector2Node, ScalarNode]) => {
        const dst = dist(pos_immutable.toVec2()).y;
        return gaus(dst.add(float(off_immutable)), uHardScan);
      },
    );

    const tri = Fn(([pos_immutable]: [Vector2Node]) => {
      const pos = pos_immutable.toVec2();
      const a = horz3(pos, float(-1.0));
      const b = horz5(pos, float(0.0));
      const c = horz3(pos, float(1.0));
      const wa = scan(pos, float(-1.0));
      const wb = scan(pos, float(0.0));
      const wc = scan(pos, float(1.0));
      return a.mul(wa).add(b.mul(wb)).add(c.mul(wc));
    });

    const mask = Fn(([fragPos_immutable]: [Vector2Node]) => {
      const pos = fragPos_immutable.toVec2().toVar();
      const m = vec3(uMaskDark).toVar();
      pos.x.addAssign(pos.y.mul(3.0));
      const fx = fract(pos.x.mul(0.166666666));
      m.assign(
        fx
          .lessThan(0.333)
          .select(
            vec3(uMaskLight, uMaskDark, uMaskDark),
            fx
              .lessThan(0.666)
              .select(
                vec3(uMaskDark, uMaskLight, uMaskDark),
                vec3(uMaskDark, uMaskDark, uMaskLight),
              ),
          ),
      );
      return m;
    });

    const col = tri(warpedUV).toVar();
    col.mulAssign(mask(warpedUV.mul(res)));

    const d = rawUV.sub(0.5);
    const vig = float(1.0).sub(d.dot(d).mul(uVignette));
    col.mulAssign(vig);

    const border = warpedUV.x
      .greaterThanEqual(0.0)
      .and(warpedUV.x.lessThanEqual(1.0))
      .and(warpedUV.y.greaterThanEqual(0.0))
      .and(warpedUV.y.lessThanEqual(1.0));
    const finalColor = mix(vec3(0.0), col, border.toFloat());

    return vec4(finalColor, 1.0);
  })();
}

export function createCrtEffect(enabled: boolean): PostProcessingEffect {
  const uniforms = createCrtUniforms();

  return {
    key: "crt",
    enabled,
    build: (inputNode) => crtNode(inputNode, uniforms),
  };
}
