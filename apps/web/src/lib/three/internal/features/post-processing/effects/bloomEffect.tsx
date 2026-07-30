import { bloom } from "three/addons/tsl/display/BloomNode.js";

import type { PostProcessingEffect } from "../postProcessing.types";

export function createBloomEffect(enabled: boolean): PostProcessingEffect {
  return {
    key: "bloom",
    enabled,
    build(inputNode) {
      const bloomPass = bloom(inputNode, 0.53, 0.35, 0.12);
      return inputNode.add(bloomPass);
    },
  };
}
