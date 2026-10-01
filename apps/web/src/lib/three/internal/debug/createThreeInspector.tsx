import type { WebGPURenderer } from "three/webgpu";

import { Inspector } from "three/addons/inspector/Inspector.js";

function isThreeDebugEnabled(): boolean {
  // Bundlers replace this expression. The dev server folds it to true, and
  // production builds replace it with "production".
  return process.env.NODE_ENV !== "production";
}

export function createThreeInspector(
  renderer: WebGPURenderer,
): Inspector | null {
  if (!isThreeDebugEnabled()) return null;

  const inspector = new Inspector();
  renderer.inspector = inspector;
  return inspector;
}
