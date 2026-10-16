import type { Inspector } from "three/addons/inspector/Inspector.js";
import type { ParametersGroup } from "three/addons/inspector/tabs/Parameters.js";

import {
  BACKGROUND_IDS,
  BACKGROUND_PRESETS,
  POST_PASS_KEYS,
  type PostPasses,
} from "@dither-booth/shared/backgrounds";

import type {
  BackgroundEffect,
  BackgroundPreset,
} from "../internal/features/background.types";
import type { ThreeRuntime } from "../internal/runtime/runtime.types";
import type { ThreeEnvironmentOptions } from "./ThreeEnvironment.types";

import { createThreeInspector } from "../internal/debug/createThreeInspector";
import { FluidBackground } from "../internal/features/fluid-background/FluidBackground";
import { PostProcessingPipeline } from "../internal/features/post-processing/PostProcessing";
import { SmokeBackground } from "../internal/features/smoke-background/SmokeBackground";
import { PointerInput } from "../internal/input/PointerInput";
import { createRenderer } from "../internal/runtime/createRenderer";
import { createScene } from "../internal/runtime/createScene";
import { FrameLoop } from "../internal/runtime/frameLoop";
import { SizeObserver } from "../internal/runtime/sizeObserver";

function getDefaultPixelRatio(): number {
  if (typeof window === "undefined") return 1;
  return Math.min(window.devicePixelRatio || 1, 2);
}

const samePasses = (a: PostPasses, b: PostPasses) =>
  POST_PASS_KEYS.every((key) => a[key] === b[key]);

export class ThreeEnvironment {
  private readonly _container: HTMLElement;
  private readonly _runtime: ThreeRuntime;
  private readonly _pointer: PointerInput;
  private _background: BackgroundEffect;
  private _preset: BackgroundPreset;
  /** The latest `apply` before `init` finished; applied once it has. */
  private _pendingPreset: BackgroundPreset | null = null;
  private _backgroundFolder: ParametersGroup | null = null;
  private _backgroundDebug: ParametersGroup | null = null;
  private _postProcessing: PostProcessingPipeline;
  private _settingsFolder: ParametersGroup | null = null;
  private _postDebug: ParametersGroup | null = null;
  private readonly _sizeObserver: SizeObserver;
  private readonly _frameLoop: FrameLoop;
  private _intersectionObserver: IntersectionObserver | null = null;
  private _inspector: Inspector | null = null;
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
    const preset = options.background ?? BACKGROUND_PRESETS.fluid;
    this._preset = preset;
    this._background = this._createBackground(preset);
    this._background.attach(scene);

    this._postProcessing = new PostProcessingPipeline(
      preset.postProcessing,
      preset.passes,
    );
    this._frameLoop = new FrameLoop(renderer, (delta) => this._render(delta));
  }

  get canvas(): HTMLCanvasElement {
    return this._runtime.renderer.domElement;
  }

  async init(): Promise<void> {
    if (this._disposed || this._initialized) return;

    const { renderer, scene, camera } = this._runtime;
    const inspector = createThreeInspector(renderer);
    if (this._disposed) {
      inspector?.domElement.remove();
      return;
    }

    this._inspector = inspector;
    await renderer.init();

    if (this._disposed) {
      inspector?.domElement.remove();
      this._inspector = null;
      return;
    }

    this._background.init(renderer);

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
    this._attachDebug();
    this._initialized = true;
    this._syncFrameLoop();

    const pending = this._pendingPreset;
    this._pendingPreset = null;
    if (pending) this.apply(pending);
  }

  /**
   * Shows `preset`, changing as little as it can: new values go straight into
   * the live uniforms, another shader replaces the current one, and changed
   * post passes rebuild the post chain (they are part of its node graph).
   */
  apply(preset: BackgroundPreset): void {
    if (this._disposed) return;
    if (!this._initialized) {
      this._pendingPreset = preset;
      return;
    }

    const previous = this._preset;
    this._preset = preset;

    if (preset.effect === previous.effect) {
      this._background.applySettings(preset);
    } else {
      this._replaceBackground(preset);
    }

    if (samePasses(previous.passes, preset.passes)) {
      this._postProcessing.applySettings(preset.postProcessing);
    } else {
      void this._rebuildPostProcessing(preset);
    }
  }

  private _replaceBackground(preset: BackgroundPreset): void {
    const { renderer, scene } = this._runtime;
    this._background.dispose();
    this._background = this._createBackground(preset);
    this._background.attach(scene);
    this._background.init(renderer);
    this._attachBackgroundDebug();
  }

  private async _rebuildPostProcessing(preset: BackgroundPreset) {
    const { renderer, scene, camera } = this._runtime;
    const next = new PostProcessingPipeline(
      preset.postProcessing,
      preset.passes,
    );
    this._postProcessing.dispose();
    this._postProcessing = next;
    // A newer rebuild or a dispose makes this one moot.
    await next.setup(
      renderer,
      scene,
      camera,
      () => this._disposed || this._postProcessing !== next,
    );
    if (this._postProcessing === next) this._attachPostDebug();
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
    // The buffer only: CSS keeps the canvas at the container's size.
    renderer.setSize(size.width, size.height, false);

    this._background.resize(size);
    this._postProcessing.resize();
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;

    this._detachInspector();
    this._frameLoop.dispose();
    this._sizeObserver.dispose();
    this._teardownVisibilityControls();
    this._pointer.dispose();
    this._postProcessing.dispose();
    this._background.dispose();
    this._runtime.renderer.dispose();
    this._runtime.renderer.domElement.remove();
  }

  private _attachDebug(): void {
    const inspector = this._inspector;
    if (!inspector) return;

    document.body.appendChild(inspector.domElement);
    const settings = inspector.createParameters("Settings");
    this._settingsFolder = settings;
    const backgroundFolder = settings.addFolder("Background");
    backgroundFolder
      .add({ preset: this._preset.effect }, "preset", [...BACKGROUND_IDS])
      .name("Preset")
      .onChange((name: (typeof BACKGROUND_IDS)[number]) => {
        this.apply(BACKGROUND_PRESETS[name]);
      });
    this._backgroundFolder = backgroundFolder;
    this._attachBackgroundDebug();
    this._attachPostDebug();
  }

  private _attachBackgroundDebug(): void {
    const folder = this._backgroundFolder;
    if (!folder) return;

    this._backgroundDebug?.paramList.domElement.remove();
    this._backgroundDebug = folder.addFolder(this._preset.effect);
    this._background.attachDebug(this._backgroundDebug);
  }

  private _attachPostDebug(): void {
    const folder = this._settingsFolder;
    if (!folder) return;

    this._postDebug?.paramList.domElement.remove();
    this._postDebug = this._postProcessing.attachDebug(folder);
  }

  private _detachInspector(): void {
    this._inspector?.domElement.remove();
    this._inspector = null;
    this._settingsFolder = null;
    this._backgroundFolder = null;
    this._backgroundDebug = null;
    this._postDebug = null;
  }

  private _createBackground(preset: BackgroundPreset): BackgroundEffect {
    const size = this._runtime.size;
    const splats = () => this._pointer.drainSplats();

    switch (preset.effect) {
      case "fluid":
        return new FluidBackground({ settings: preset.settings, size, splats });
      case "smoke":
        return new SmokeBackground({ settings: preset.settings, size, splats });
      default: {
        // A new background must be wired here before it compiles.
        const unhandled: never = preset;
        throw new Error(`Unknown background ${JSON.stringify(unhandled)}`);
      }
    }
  }

  private _render(delta: number): void {
    this._background.update(delta);
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
