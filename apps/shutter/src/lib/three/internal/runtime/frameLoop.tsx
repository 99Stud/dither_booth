import type { WebGPURenderer } from "three/webgpu";

export class FrameLoop {
  private readonly _renderer: WebGPURenderer;
  private readonly _renderFrame: (delta: number, elapsed: number) => void;
  private _running = false;
  private _lastTime = 0;

  constructor(
    renderer: WebGPURenderer,
    renderFrame: (delta: number, elapsed: number) => void,
  ) {
    this._renderer = renderer;
    this._renderFrame = renderFrame;
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this._lastTime = 0;
    this._renderer.setAnimationLoop(this._handleAnimationFrame);
  }

  stop(): void {
    if (!this._running) return;
    this._running = false;
    this._renderer.setAnimationLoop(null);
    this._lastTime = 0;
  }

  dispose(): void {
    this.stop();
  }

  private readonly _handleAnimationFrame = (time: number): void => {
    const elapsed = time / 1000;
    const delta = this._lastTime > 0 ? elapsed - this._lastTime : 1 / 60;
    this._lastTime = elapsed;
    this._renderFrame(Math.min(Math.max(delta, 0), 0.05), elapsed);
  };
}
