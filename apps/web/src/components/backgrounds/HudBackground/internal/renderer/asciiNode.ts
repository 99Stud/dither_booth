import {
  convertToTexture,
  dot,
  float,
  Fn,
  floor,
  fract,
  int,
  screenSize,
  uniform,
  uv,
  vec3,
  vec4,
} from "three/tsl";
import type Node from "three/src/nodes/core/Node.js";
import { ASCII } from "../hudBackground.config.ts";

const uCellSize = uniform(ASCII.cellSize);
const uInvert = uniform(ASCII.invert);
const uColor = uniform(ASCII.color);
const uCharBrightness = uniform(ASCII.charBrightness);
const uBackgroundBrightness = uniform(ASCII.bgBrightness);

function buildCharBitmaps(): number[] {
  const patterns: string[][] = [
    ["00000", "00000", "00000", "00000", "00000"],
    ["00000", "00000", "00000", "00100", "00000"],
    ["00000", "00100", "00000", "00100", "00000"],
    ["00000", "00000", "01110", "00000", "00000"],
    ["00000", "01110", "00000", "01110", "00000"],
    ["00000", "00100", "01110", "00100", "00000"],
    ["00000", "01010", "00100", "01010", "00000"],
    ["01010", "11111", "01010", "11111", "01010"],
    ["11001", "11010", "00100", "01011", "10011"],
    ["01110", "10101", "10111", "10000", "01110"],
  ];

  return patterns.map((rows) => {
    let bits = 0;
    for (let r = 0; r < 5; r++) {
      const row = rows[r]!;
      for (let c = 0; c < 5; c++) {
        if (row[c] === "1") {
          bits |= 1 << (r * 5 + c);
        }
      }
    }
    return bits;
  });
}

const CHAR_BITMAPS = buildCharBitmaps();
const CHAR_COUNT = CHAR_BITMAPS.length;
const uCharBitmaps = CHAR_BITMAPS.map((v) => uniform(v));

export const asciiNode = (inputNode: Node) => {
  const tex = convertToTexture(inputNode);

  return Fn(() => {
    const coordPx = uv().mul(screenSize);
    const cellXY = floor(coordPx.div(uCellSize));
    const cellCenter = cellXY.add(0.5).mul(uCellSize).div(screenSize);
    const sceneColor = tex.sample(cellCenter).rgb;
    const luminance = dot(sceneColor, vec3(0.299, 0.587, 0.114)).toVar();
    const brightness = luminance.clamp(0.0, 1.0).toVar();
    const inverted = float(1.0).sub(brightness);
    brightness.assign(uInvert.greaterThan(0.5).select(inverted, brightness));

    const charIndex = int(
      floor(brightness.mul(float(CHAR_COUNT - 1)).add(0.2)).clamp(0.0, float(CHAR_COUNT - 1)),
    );

    const localPos = fract(coordPx.div(uCellSize));
    const pixelX = int(floor(localPos.x.mul(5.0)).clamp(0.0, 4.0));
    const pixelY = int(floor(localPos.y.mul(5.0)).clamp(0.0, 4.0));
    const bitIndex = pixelY.mul(5).add(pixelX);

    let bitmapValue: ReturnType<typeof int> = int(uCharBitmaps[0]!);
    for (let i = CHAR_COUNT - 1; i >= 1; i--) {
      bitmapValue = charIndex.equal(i).select(int(uCharBitmaps[i]!), bitmapValue);
    }

    const bitMask = int(1).shiftLeft(bitIndex);
    const isLit = bitmapValue.bitAnd(bitMask).greaterThan(0);

    const charColor = uColor.greaterThan(0.5).select(sceneColor.mul(uCharBrightness), vec3(uCharBrightness));
    const bgColor = uColor.greaterThan(0.5).select(
      sceneColor.mul(uBackgroundBrightness),
      vec3(uBackgroundBrightness),
    );

    const finalColor = isLit.select(charColor, bgColor);
    return vec4(finalColor, 1.0);
  })();
};
