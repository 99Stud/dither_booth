import { bloom } from "three/addons/tsl/display/BloomNode.js";
import type { Node } from "three/webgpu";
import { BLOOM } from "../hudBackground.config.ts";

export const bloomNode = (inputNode: Node) => {
  return bloom(inputNode, BLOOM.strength, BLOOM.radius, BLOOM.threshold);
};
