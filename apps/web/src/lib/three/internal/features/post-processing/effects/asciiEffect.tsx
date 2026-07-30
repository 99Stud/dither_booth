import type { Texture } from "three";
import type { TextureNode } from "three/webgpu";

import {
  DataTexture,
  FloatType,
  LinearFilter,
  NearestFilter,
  RGBAFormat,
  TextureLoader,
} from "three";
import {
  convertToTexture,
  dot,
  float,
  Fn,
  floor,
  fract,
  int,
  max,
  min,
  mix,
  screenSize,
  smoothstep,
  uniform,
  uniformTexture,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

import type {
  PostProcessingEffect,
  PostProcessingEffectNode,
} from "../postProcessing.types";

import fntData from "./assets/eslava.fnt" with { type: "json" };

type GlyphMetric = (typeof fntData.chars)[number];

const atlasW = fntData.common.scaleW;
const atlasH = fntData.common.scaleH;
const lineHeight = fntData.common.lineHeight;
const msdfDistanceRange = fntData.distanceField.distanceRange;

const charMap = new Map<string, GlyphMetric>();
for (const char of fntData.chars) {
  charMap.set(char.char, char);
}

const DENSITY_CHARS =
  ' .`^",:;!i~+=-?/\\|)(1[]{}ItflrJLcvzsxuoenkYXCUZahdqpVASTEFPGDOHKRBN09b#8%W&Mw@m$Q';

const densityGlyphs = Array.from(DENSITY_CHARS, (char) => charMap.get(char));
const validGlyphs = densityGlyphs.filter((glyph): glyph is GlyphMetric =>
  Boolean(glyph),
);
const GLYPH_COUNT = validGlyphs.length;

const LUT_WIDTH = GLYPH_COUNT;
const LUT_HEIGHT = 2;
const glyphLutData = new Float32Array(LUT_WIDTH * LUT_HEIGHT * 4);

for (let i = 0; i < GLYPH_COUNT; i++) {
  const glyph = validGlyphs[i];
  if (!glyph) continue;

  const isSpace = glyph.width === 0 || glyph.height === 0;
  const row0 = i * 4;
  glyphLutData[row0] = isSpace ? 0 : glyph.x / atlasW;
  glyphLutData[row0 + 1] = isSpace
    ? 0
    : 1.0 - (glyph.y + glyph.height) / atlasH;
  glyphLutData[row0 + 2] = isSpace ? 0 : glyph.width / atlasW;
  glyphLutData[row0 + 3] = isSpace ? 0 : glyph.height / atlasH;

  const row1 = (LUT_WIDTH + i) * 4;
  glyphLutData[row1] = isSpace ? 0 : glyph.xoffset / lineHeight;
  glyphLutData[row1 + 1] = isSpace
    ? 0
    : 1.0 - (glyph.yoffset + glyph.height) / lineHeight;
  glyphLutData[row1 + 2] = isSpace ? 0 : glyph.width / lineHeight;
  glyphLutData[row1 + 3] = isSpace ? 0 : glyph.height / lineHeight;
}

function createAsciiUniforms() {
  return {
    uCellSize: uniform(14),
    uInvert: uniform(1),
    uColor: uniform(1.0),
    uCharBrightness: uniform(1.98),
    uBackgroundBrightness: uniform(0.56),
    uSmoothness: uniform(0.1),
  };
}

function createGlyphLutTexture(): DataTexture {
  const texture = new DataTexture(
    glyphLutData,
    LUT_WIDTH,
    LUT_HEIGHT,
    RGBAFormat,
    FloatType,
  );
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function createAsciiResources() {
  const uniforms = createAsciiUniforms();
  const glyphLutTexture = createGlyphLutTexture();
  const uGlyphLUT: TextureNode = uniformTexture(glyphLutTexture);
  const uAtlas: TextureNode = uniformTexture();
  let atlasTexture: Texture | null = null;
  let loadPromise: Promise<void> | null = null;
  let disposed = false;

  function prepare(): Promise<void> {
    if (atlasTexture) return Promise.resolve();
    if (loadPromise) return loadPromise;

    loadPromise = new Promise((resolve, reject) => {
      const loader = new TextureLoader();
      loader.load(
        "/textures/eslava.png",
        (texture) => {
          texture.minFilter = LinearFilter;
          texture.magFilter = LinearFilter;
          texture.generateMipmaps = false;

          if (disposed) {
            texture.dispose();
            resolve();
            return;
          }

          atlasTexture = texture;
          uAtlas.value = texture;
          resolve();
        },
        undefined,
        (error) => {
          loadPromise = null;
          reject(error);
        },
      );
    });

    return loadPromise;
  }

  function dispose(): void {
    disposed = true;
    glyphLutTexture.dispose();
    atlasTexture?.dispose();
    atlasTexture = null;
    loadPromise = null;
  }

  return {
    uniforms,
    uGlyphLUT,
    uAtlas,
    prepare,
    dispose,
  };
}

type AsciiResources = ReturnType<typeof createAsciiResources>;

function asciiNode(
  inputNode: PostProcessingEffectNode,
  resources: AsciiResources,
) {
  const {
    uniforms: {
      uCellSize,
      uInvert,
      uColor,
      uCharBrightness,
      uBackgroundBrightness,
      uSmoothness,
    },
    uGlyphLUT,
    uAtlas,
  } = resources;
  const tex = convertToTexture(inputNode);

  return Fn(() => {
    const coordPx = uv().mul(screenSize);
    const cellXY = floor(coordPx.div(uCellSize));
    const cellCenter = cellXY.add(0.5).mul(uCellSize).div(screenSize);
    const sceneColor = tex.sample(cellCenter).rgb;
    const luminance = dot(sceneColor, vec3(0.299, 0.587, 0.114));
    const brightness = luminance.clamp(0.0, 1.0).toVar();

    const density = float(1.0).sub(brightness).toVar();
    density.assign(uInvert.greaterThan(0.5).select(brightness, density));

    const charIndex = int(
      floor(density.mul(float(GLYPH_COUNT - 1)).add(0.5)).clamp(
        0.0,
        float(GLYPH_COUNT - 1),
      ),
    );
    const isSpace = charIndex.equal(int(0));
    const lutU = charIndex.toFloat().add(0.5).div(float(LUT_WIDTH));

    const uvRect = uGlyphLUT.sample(vec2(lutU, 0.25));
    const placement = uGlyphLUT.sample(vec2(lutU, 0.75));
    const localPos = fract(coordPx.div(uCellSize));

    const glyphX0 = placement.x;
    const glyphY0 = placement.y;
    const glyphW = placement.z;
    const glyphH = placement.w;

    const inGlyph = localPos.x
      .greaterThanEqual(glyphX0)
      .and(localPos.x.lessThan(glyphX0.add(glyphW)))
      .and(localPos.y.greaterThanEqual(glyphY0))
      .and(localPos.y.lessThan(glyphY0.add(glyphH)));

    const safeW = max(glyphW, float(0.001));
    const safeH = max(glyphH, float(0.001));
    const glyphLocalX = localPos.x.sub(glyphX0).div(safeW).clamp(0.0, 1.0);
    const glyphLocalY = localPos.y.sub(glyphY0).div(safeH).clamp(0.0, 1.0);
    const atlasUV = vec2(
      uvRect.x.add(glyphLocalX.mul(uvRect.z)),
      uvRect.y.add(glyphLocalY.mul(uvRect.w)),
    );

    const msdfSample = uAtlas.sample(atlasUV).rgb;
    const sd = max(
      min(msdfSample.r, msdfSample.g),
      min(max(msdfSample.r, msdfSample.g), msdfSample.b),
    );
    const glyphScreenPx = safeH.mul(uCellSize);
    const glyphAtlasTexels = max(uvRect.w.mul(float(atlasH)), float(1.0));
    const scaledPxRange = float(msdfDistanceRange).mul(
      glyphScreenPx.div(glyphAtlasTexels),
    );
    const screenPxDist = scaledPxRange.mul(sd.sub(0.5));
    const msdfAlpha = smoothstep(
      uSmoothness.negate(),
      uSmoothness,
      screenPxDist,
    );

    const alpha = isSpace.select(
      float(0.0),
      inGlyph.select(msdfAlpha, float(0.0)),
    );
    const charColor = uColor
      .greaterThan(0.5)
      .select(sceneColor.mul(uCharBrightness), vec3(uCharBrightness));
    const bgColor = uColor
      .greaterThan(0.5)
      .select(
        sceneColor.mul(uBackgroundBrightness),
        vec3(uBackgroundBrightness),
      );

    return vec4(
      mix(bgColor, charColor, alpha),
      max(alpha, uBackgroundBrightness),
    );
  })();
}

export function createAsciiEffect(enabled: boolean): PostProcessingEffect {
  let resources: AsciiResources | null = null;

  function getResources(): AsciiResources {
    resources ??= createAsciiResources();
    return resources;
  }

  return {
    key: "ascii",
    enabled,
    prepare: () => getResources().prepare(),
    build: (inputNode) => asciiNode(inputNode, getResources()),
    dispose: () => {
      resources?.dispose();
      resources = null;
    },
  };
}
