import type {
  Camera,
  Node,
  PassNode,
  PerspectiveCamera,
  Scene,
  TextureNode,
  WebGPURenderer,
} from "three/webgpu";

import { ACESFilmicToneMapping, NoToneMapping } from "three";
import {
  acesFilmicToneMapping,
  emissive,
  float,
  mrt,
  output,
  pass,
} from "three/tsl";
import { RenderPipeline } from "three/webgpu";

import type {
  PostProcessingEffect,
  PostProcessingEffectNode,
  PostProcessingOptions,
  PostProcessingPassConfig,
} from "./postProcessing.types";

import { createAsciiEffect } from "./effects/asciiEffect";
import { createBloomEffect } from "./effects/bloomEffect";
import { createCrtEffect } from "./effects/crtEffect";
import { createFilmEffect } from "./effects/filmEffect";
import { createScanlinesEffect } from "./effects/scanlinesEffect";

const PASS_DEFAULTS = {
  ascii: { enabled: true },
  bloom: { enabled: true },
  crt: { enabled: true },
  film: { enabled: true },
  scanlines: { enabled: true },
};

function createPassConfig(
  options?: PostProcessingOptions,
): PostProcessingPassConfig {
  const passes = options?.passes ?? {};

  return {
    ascii: { enabled: passes.ascii?.enabled ?? PASS_DEFAULTS.ascii.enabled },
    bloom: { enabled: passes.bloom?.enabled ?? PASS_DEFAULTS.bloom.enabled },
    crt: { enabled: passes.crt?.enabled ?? PASS_DEFAULTS.crt.enabled },
    film: { enabled: passes.film?.enabled ?? PASS_DEFAULTS.film.enabled },
    scanlines: {
      enabled: passes.scanlines?.enabled ?? PASS_DEFAULTS.scanlines.enabled,
    },
  };
}

function createEffects(
  config: PostProcessingPassConfig,
): PostProcessingEffect[] {
  return [
    createAsciiEffect(config.ascii.enabled),
    createBloomEffect(config.bloom.enabled),
    createCrtEffect(config.crt.enabled),
    createFilmEffect(config.film.enabled),
    createScanlinesEffect(config.scanlines.enabled),
  ];
}

export class PostProcessingPipeline {
  readonly passes: PostProcessingPassConfig;

  postProcessing: RenderPipeline | undefined;
  scenePass: PassNode | undefined;

  private readonly _effects: PostProcessingEffect[];
  private _renderer: WebGPURenderer | null = null;

  constructor(options: PostProcessingOptions = {}) {
    this.passes = createPassConfig(options);
    this._effects = createEffects(this.passes);
  }

  private setupMRT(scene: Scene, camera: Camera): TextureNode {
    this.scenePass = pass(scene, camera);

    const needsEmissive = this.passes.bloom.enabled;
    const mrtConfig: Record<string, Node> = needsEmissive
      ? { output, emissive }
      : { output };

    this.scenePass.setMRT(mrt(mrtConfig));

    return this.scenePass.getTextureNode("output");
  }

  async setup(
    renderer: WebGPURenderer,
    scene: Scene,
    camera: PerspectiveCamera,
    shouldAbort: () => boolean = () => false,
  ): Promise<void> {
    if (shouldAbort()) return;

    this.dispose();
    if (shouldAbort()) return;

    this.postProcessing = new RenderPipeline(renderer);
    this.postProcessing.outputColorTransform = true;

    this._renderer = renderer;
    renderer.toneMapping = NoToneMapping;

    let color: PostProcessingEffectNode = this.setupMRT(scene, camera);

    for (const effect of this._effects) {
      if (!effect.enabled) continue;
      await effect.prepare?.();
      if (shouldAbort()) {
        this.dispose();
        return;
      }
      color = effect.build(color);
    }

    if (shouldAbort() || !this.postProcessing) {
      this.dispose();
      return;
    }

    this.postProcessing.outputNode = acesFilmicToneMapping(color, float(1.0));
  }

  render(): void {
    this.postProcessing?.render();
  }

  resize(): void {
    // RenderPipeline follows renderer size; this hook keeps the feature shape
    // aligned with other resizable internals.
  }

  dispose(): void {
    if (this._renderer) {
      this._renderer.toneMapping = ACESFilmicToneMapping;
      this._renderer = null;
    }
    this.postProcessing?.dispose();
    this.postProcessing = undefined;
    this.scenePass = undefined;
    for (const effect of this._effects) {
      effect.dispose?.();
    }
  }
}
