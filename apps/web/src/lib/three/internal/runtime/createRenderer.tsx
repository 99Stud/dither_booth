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
  renderer.setSize(size.width, size.height);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.sortObjects = false;
  renderer.outputColorSpace = SRGBColorSpace;

  return renderer;
}
