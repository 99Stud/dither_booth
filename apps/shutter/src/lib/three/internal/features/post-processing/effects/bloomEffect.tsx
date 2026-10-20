import type { ParametersGroup } from "three/addons/inspector/tabs/Parameters.js";

import { bloom } from "three/addons/tsl/display/BloomNode.js";

import type {
  BloomSettings,
  PostProcessingEffect,
  PostProcessingSettings,
} from "../postProcessing.types";

export function createBloomEffect(
  enabled: boolean,
  settings: BloomSettings,
): PostProcessingEffect {
  let bloomPass: ReturnType<typeof bloom> | null = null;
  let current = settings;

  return {
    key: "bloom",
    enabled,
    build(inputNode) {
      bloomPass = bloom(
        inputNode,
        current.strength,
        current.radius,
        current.threshold,
      );
      return inputNode.add(bloomPass);
    },
    applySettings(next: PostProcessingSettings) {
      current = next.bloom;
      if (!bloomPass) return;

      bloomPass.strength.value = current.strength;
      bloomPass.radius.value = current.radius;
      bloomPass.threshold.value = current.threshold;
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
