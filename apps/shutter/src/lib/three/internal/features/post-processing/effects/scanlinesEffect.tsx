import type { ParametersGroup } from "three/addons/inspector/tabs/Parameters.js";

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
  PostProcessingSettings,
  ScanlinesSettings,
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

function createScanlinesUniforms(settings: ScanlinesSettings) {
  return {
    uScanLineThickness: uniform(settings.thickness),
    uScanLineIntensity: uniform(settings.intensity),
    uScanLineSpeed: uniform(settings.speed),
    uScanLineFocus: uniform(settings.focus),
  };
}

export function createScanlinesEffect(
  enabled: boolean,
  settings: ScanlinesSettings,
): PostProcessingEffect {
  const uniforms = createScanlinesUniforms(settings);

  return {
    key: "scanlines",
    enabled,
    build: (inputNode) => scanlinesNode(inputNode, uniforms),
    applySettings(next: PostProcessingSettings) {
      uniforms.uScanLineThickness.value = next.scanlines.thickness;
      uniforms.uScanLineIntensity.value = next.scanlines.intensity;
      uniforms.uScanLineSpeed.value = next.scanlines.speed;
      uniforms.uScanLineFocus.value = next.scanlines.focus;
    },
    attachDebug(folder: ParametersGroup) {
      const scanlinesFolder = folder.addFolder("Scanlines");
      scanlinesFolder
        .add(uniforms.uScanLineThickness, "value", 0, 10, 0.1)
        .name("Scan Line Thickness");
      scanlinesFolder
        .add(uniforms.uScanLineIntensity, "value", 0, 1, 0.01)
        .name("Scan Line Intensity");
      scanlinesFolder
        .add(uniforms.uScanLineSpeed, "value", 0, 10, 0.1)
        .name("Scan Line Speed");
      scanlinesFolder
        .add(uniforms.uScanLineFocus, "value", 0, 10, 0.1)
        .name("Scan Line Focus");
    },
  };
}
