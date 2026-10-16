import type { Inspector } from "three/addons/inspector/Inspector.js";
import type { ParametersGroup } from "three/addons/inspector/tabs/Parameters.js";

import type {
  BackgroundEffect,
  BackgroundPreset,
} from "../internal/features/background.types";
import type { ThreeRuntime } from "../internal/runtime/runtime.types";
import type { BackgroundPresetKey } from "../presets/backgroundPresets";
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
import {
  BACKGROUND_PRESET_KEYS,
  BACKGROUND_PRESETS,
  DEFAULT_BACKGROUND_PRESET,
} from "../presets/backgroundPresets";

function getDefaultPixelRatio(): number {
  if (typeof window === "undefined") return 1;
  return Math.min(window.devicePixelRatio || 1, 2);
}

function resolveBackgroundPreset(
  background: BackgroundPresetKey | BackgroundPreset,
): BackgroundPreset {
  return typeof background === "string"
    ? BACKGROUND_PRESETS[background]
    : background;
}

export class ThreeEnvironment {
  private readonly _container: HTMLElement;
  private readonly _runtime: ThreeRuntime;
  private readonly _pointer: PointerInput;
  private _background: BackgroundEffect;
  private _presetName: BackgroundPresetKey | "custom";
  private _backgroundFolder: ParametersGroup | null = null;
  private _backgroundDebug: ParametersGroup | null = null;
  private readonly _postProcessing: PostProcessingPipeline;
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
    const background = options.background ?? DEFAULT_BACKGROUND_PRESET;
    const preset = resolveBackgroundPreset(background);
    this._presetName = typeof background === "string" ? background : "custom";
    this._background = this._createBackground(preset);
    this._background.attach(scene);

    this._postProcessing = new PostProcessingPipeline(
      preset.postProcessing,
      options.postProcessing,
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
  }

  setBackground(background: BackgroundPresetKey | BackgroundPreset): void {
    if (this._disposed || background === this._presetName) return;

    const { renderer, scene } = this._runtime;
    const preset = resolveBackgroundPreset(background);
    this._background.dispose();
    this._presetName = typeof background === "string" ? background : "custom";
    this._background = this._createBackground(preset);
    this._background.attach(scene);
    this._postProcessing.applySettings(preset.postProcessing);
    if (this._initialized) this._background.init(renderer);
    this._attachBackgroundDebug();
    this._attachPostDebug();
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
      .add({ preset: this._presetName }, "preset", BACKGROUND_PRESET_KEYS)
      .name("Preset")
      .onChange((name) => {
        if (name !== "custom") this.setBackground(name);
      });
    this._backgroundFolder = backgroundFolder;
    this._attachBackgroundDebug();
    this._attachPostDebug();
  }

  private _attachBackgroundDebug(): void {
    const folder = this._backgroundFolder;
    if (!folder) return;

    this._backgroundDebug?.paramList.domElement.remove();
    this._backgroundDebug = folder.addFolder(this._presetName);
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
