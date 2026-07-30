import type { ThreeRuntime } from "../internal/runtime/runtime.types";
import type { ThreeEnvironmentOptions } from "./ThreeEnvironment.types";

import { FluidBackground } from "../internal/features/fluid-background/FluidBackground";
import { PostProcessingPipeline } from "../internal/features/post-processing/PostProcessing";
import { PointerInput } from "../internal/input/PointerInput";
import { createRenderer } from "../internal/runtime/createRenderer";
import { createScene } from "../internal/runtime/createScene";
import { FrameLoop } from "../internal/runtime/frameLoop";
import { SizeObserver } from "../internal/runtime/sizeObserver";

function getDefaultPixelRatio(): number {
  if (typeof window === "undefined") return 1;
  return Math.min(window.devicePixelRatio || 1, 2);
}

export class ThreeEnvironment {
  private readonly _container: HTMLElement;
  private readonly _runtime: ThreeRuntime;
  private readonly _pointer: PointerInput;
  private readonly _fluidBackground: FluidBackground;
  private readonly _postProcessing: PostProcessingPipeline;
  private readonly _sizeObserver: SizeObserver;
  private readonly _frameLoop: FrameLoop;
  private _intersectionObserver: IntersectionObserver | null = null;
  private _disposed = false;
  private _initialized = false;
  private _wantsToRun = false;
  private _documentVisible = true;
  private _elementVisible = true;

  constructor(options: ThreeEnvironmentOptions) {
    this._container = options.container;

    const pixelRatio = options.pixelRatio ?? getDefaultPixelRatio();
    this._sizeObserver = new SizeObserver({
      container: this._container,
      pixelRatio,
      onResize: (size) => this.resize(size),
    });

    const size = this._sizeObserver.getSize();

    const renderer = createRenderer({ size });
    const { scene, camera } = createScene(size);

    this._runtime = { renderer, scene, camera, size };
    this._container.appendChild(renderer.domElement);

    this._pointer = new PointerInput(renderer.domElement);
    this._fluidBackground = new FluidBackground({
      options: options.fluidBackground,
      size,
      splats: () => this._pointer.drainSplats(),
    });
    this._fluidBackground.attach(scene);

    this._postProcessing = new PostProcessingPipeline(options.postProcessing);
    this._frameLoop = new FrameLoop(renderer, (delta) => this._render(delta));
  }

  get canvas(): HTMLCanvasElement {
    return this._runtime.renderer.domElement;
  }

  async init(): Promise<void> {
    if (this._disposed || this._initialized) return;

    const { renderer, scene, camera } = this._runtime;
    await renderer.init();

    if (this._disposed) return;

    this._fluidBackground.init(renderer);

    await this._postProcessing.setup(
      renderer,
      scene,
      camera,
      () => this._disposed,
    );
    if (this._disposed) {
      this._postProcessing.dispose();
      return;
    }

    this._sizeObserver.observe();
    this._setupVisibilityControls();
    this._initialized = true;
    this._syncFrameLoop();
  }

  start(): void {
    if (this._disposed) return;
    this._wantsToRun = true;
    this._syncFrameLoop();
  }

  stop(): void {
    this._wantsToRun = false;
    this._syncFrameLoop();
  }

  resize(size = this._sizeObserver.getSize()): void {
    if (this._disposed) return;

    const { renderer, camera } = this._runtime;
    this._runtime.size = size;

    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();

    renderer.setPixelRatio(size.pixelRatio);
    renderer.setSize(size.width, size.height);

    this._fluidBackground.resize(size);
    this._postProcessing.resize();
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;

    this._frameLoop.dispose();
    this._sizeObserver.dispose();
    this._teardownVisibilityControls();
    this._pointer.dispose();
    this._postProcessing.dispose();
    this._fluidBackground.dispose();
    this._runtime.renderer.dispose();
    this._runtime.renderer.domElement.remove();
  }

  private _render(delta: number): void {
    this._fluidBackground.update(delta);
    this._postProcessing.render();
  }

  private _setupVisibilityControls(): void {
    if (typeof document !== "undefined") {
      this._documentVisible = document.visibilityState !== "hidden";
      document.addEventListener(
        "visibilitychange",
        this._handleVisibilityChange,
      );
    }

    if (typeof IntersectionObserver !== "undefined") {
      this._intersectionObserver = new IntersectionObserver(([entry]) => {
        this._elementVisible = entry?.isIntersecting ?? true;
        this._syncFrameLoop();
      });
      this._intersectionObserver.observe(this._container);
    }
  }

  private _teardownVisibilityControls(): void {
    if (typeof document !== "undefined") {
      document.removeEventListener(
        "visibilitychange",
        this._handleVisibilityChange,
      );
    }
    this._intersectionObserver?.disconnect();
    this._intersectionObserver = null;
  }

  private readonly _handleVisibilityChange = (): void => {
    this._documentVisible = document.visibilityState !== "hidden";
    this._syncFrameLoop();
  };

  private _syncFrameLoop(): void {
    if (this._disposed) return;
    const shouldRun =
      this._wantsToRun &&
      this._initialized &&
      this._documentVisible &&
      this._elementVisible;

    if (shouldRun) {
      this._frameLoop.start();
      return;
    }

    this._frameLoop.stop();
  }
}

export function createThreeEnvironment(
  options: ThreeEnvironmentOptions,
): ThreeEnvironment {
  return new ThreeEnvironment(options);
}
