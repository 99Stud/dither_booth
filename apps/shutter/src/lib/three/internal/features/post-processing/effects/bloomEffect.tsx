import type { ParametersGroup } from "three/addons/inspector/tabs/Parameters.js";

import { bloom } from "three/addons/tsl/display/BloomNode.js";

import type { PostProcessingEffect } from "../postProcessing.types";

export function createBloomEffect(enabled: boolean): PostProcessingEffect {
  let bloomPass: ReturnType<typeof bloom> | null = null;

  return {
    key: "bloom",
    enabled,
    build(inputNode) {
      bloomPass = bloom(inputNode, 0.53, 0.35, 0.12);
      return inputNode.add(bloomPass);
    },
    attachDebug(folder: ParametersGroup) {
      if (!bloomPass) return;

      const bloomFolder = folder.addFolder("Bloom Node");
      bloomFolder.add(bloomPass.strength, "value", 0, 3, 0.01).name("Strength");
      bloomFolder.add(bloomPass.radius, "value", 0, 1, 0.01).name("Radius");
      bloomFolder
        .add(bloomPass.threshold, "value", 0, 1, 0.01)
        .name("Threshold");
    },
  };
}
