import { exp, float, fract, Fn, screenSize, time, uniform, uv, vec4 } from "three/tsl";
import type Node from "three/src/nodes/core/Node.js";
import { SCANLINES } from "../hudBackground.config.ts";

const uScanLineThickness = uniform(SCANLINES.thickness);
const uScanLineIntensity = uniform(SCANLINES.intensity);
const uScanLineSpeed = uniform(SCANLINES.speed);
const uScanLineFocus = uniform(SCANLINES.focus);

export const scanlinesNode = (inputNode: Node) => {
  return Fn(() => {
    const col = inputNode.toVec4().rgb.toVar();
    const f = fract(
      uv().y.mul(screenSize.y).div(uScanLineThickness).sub(time.mul(uScanLineSpeed)),
    ).toVar();
    const f1 = float(1.0).sub(f);
    const blur = exp(f.mul(f).mul(uScanLineFocus).negate()).add(
      exp(f1.mul(f1).mul(uScanLineFocus).negate()),
    );
    col.mulAssign(blur.mul(float(1.0).sub(uScanLineIntensity)));
    return vec4(col, 1.0);
  })();
};
