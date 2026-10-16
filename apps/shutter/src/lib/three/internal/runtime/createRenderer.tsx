import {
  ACESFilmicToneMapping,
  SRGBColorSpace,
  WebGPURenderer,
} from "three/webgpu";

import type { ViewportSize } from "./runtime.types";

interface CreateRendererOptions {
  size: ViewportSize;
}

export function createRenderer({
  size,
}: CreateRendererOptions): WebGPURenderer {
  const renderer = new WebGPURenderer({
    antialias: false,
    powerPreference: "high-performance",
  });

  renderer.setPixelRatio(size.pixelRatio);
  // The canvas fills its container through CSS; `setSize` only sets the
  // drawing buffer. A size measured too early (an iOS home-screen app
  // settles its full height after launch) then leaves the picture a little
  // soft until the next resize, instead of a band that stops short.
  renderer.setSize(size.width, size.height, false);
  Object.assign(renderer.domElement.style, {
    display: "block",
    width: "100%",
    height: "100%",
  });
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.sortObjects = false;
  renderer.outputColorSpace = SRGBColorSpace;

  return renderer;
}
