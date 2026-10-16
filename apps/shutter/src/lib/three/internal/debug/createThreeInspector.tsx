import type { WebGPURenderer } from "three/webgpu";

import { Inspector } from "three/addons/inspector/Inspector.js";

/** Add `?debug` to the page URL to show the three.js inspector. */
export const THREE_DEBUG_PARAM = "debug";

/** Off by default, guests included; on only when the URL asks for it. */
export function isThreeDebugEnabled(search: string): boolean {
  return new URLSearchParams(search).has(THREE_DEBUG_PARAM);
}

export function createThreeInspector(
  renderer: WebGPURenderer,
): Inspector | null {
  if (!isThreeDebugEnabled(window.location.search)) return null;

  const inspector = new Inspector();
  renderer.inspector = inspector;
  return inspector;
}
