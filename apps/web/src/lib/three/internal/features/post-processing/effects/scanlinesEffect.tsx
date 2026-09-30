import {
  exp,
  float,
  fract,
  Fn,
  min,
  screenSize,
  time,
  uniform,
  uv,
  vec4,
} from "three/tsl";

import type {
  PostProcessingEffect,
  PostProcessingEffectNode,
} from "../postProcessing.types";

function scanlinesNode(
  inputNode: PostProcessingEffectNode,
  uniforms: ReturnType<typeof createScanlinesUniforms>,
) {
  const {
    uScanLineThickness,
    uScanLineIntensity,
    uScanLineSpeed,
    uScanLineFocus,
  } = uniforms;

  return Fn(() => {
    const col = inputNode.toVec4().rgb.toVar();
    const f = fract(
      uv()
        .y.mul(screenSize.y)
        .div(uScanLineThickness)
        .sub(time.mul(uScanLineSpeed)),
    );
    const fCentered = min(f, float(1.0).sub(f));
    const blur = exp(fCentered.mul(fCentered).mul(uScanLineFocus).negate()).mul(
      2.0,
    );

    col.mulAssign(blur.mul(float(1.0).sub(uScanLineIntensity)));

    return vec4(col, 1.0);
  })();
}

function createScanlinesUniforms() {
  return {
    uScanLineThickness: uniform(6.2),
    uScanLineIntensity: uniform(0.42),
    uScanLineSpeed: uniform(1),
    uScanLineFocus: uniform(4.1),
  };
}

export function createScanlinesEffect(enabled: boolean): PostProcessingEffect {
  const uniforms = createScanlinesUniforms();

  return {
    key: "scanlines",
    enabled,
    build: (inputNode) => scanlinesNode(inputNode, uniforms),
  };
}
