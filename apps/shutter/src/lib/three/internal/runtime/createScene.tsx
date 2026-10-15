import { Color, PerspectiveCamera, Scene } from "three/webgpu";

import type { ViewportSize } from "./runtime.types";

export interface SceneSetup {
  scene: Scene;
  camera: PerspectiveCamera;
}

export function createScene({ width, height }: ViewportSize): SceneSetup {
  const scene = new Scene();
  scene.background = new Color(0x000000);

  const camera = new PerspectiveCamera(60, width / height, 0.1, 1000);
  camera.position.set(0, 0, 5);

  return { scene, camera };
}
