import type { PerspectiveCamera, Scene, WebGPURenderer } from "three/webgpu";

export interface ViewportSize {
  width: number;
  height: number;
  pixelRatio: number;
}

export interface ThreeRuntime {
  renderer: WebGPURenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  size: ViewportSize;
}

export interface ResizableRuntimePart {
  resize(size: ViewportSize): void;
}

export interface DisposableRuntimePart {
  dispose(): void;
}
