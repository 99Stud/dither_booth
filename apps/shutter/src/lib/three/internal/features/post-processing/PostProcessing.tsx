import type { ParametersGroup } from "three/addons/inspector/tabs/Parameters.js";
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
  PostPasses,
  PostProcessingSettings,
} from "./postProcessing.types";

import { createAsciiEffect } from "./effects/asciiEffect";
import { createBloomEffect } from "./effects/bloomEffect";
import { createCrtEffect } from "./effects/crtEffect";
import { createFilmEffect } from "./effects/filmEffect";
import { createScanlinesEffect } from "./effects/scanlinesEffect";

function createEffects(
  passes: PostPasses,
  settings: PostProcessingSettings,
): PostProcessingEffect[] {
  return [
    createAsciiEffect(passes.ascii, settings.ascii),
    createBloomEffect(passes.bloom, settings.bloom),
    createCrtEffect(passes.crt),
    createFilmEffect(passes.film, settings.film),
    createScanlinesEffect(passes.scanlines, settings.scanlines),
  ];
}

export class PostProcessingPipeline {
  /** Which passes run. They are built into the node graph, so a change needs a new pipeline. */
  readonly passes: PostPasses;

  postProcessing: RenderPipeline | undefined;
  scenePass: PassNode | undefined;

  private readonly _effects: PostProcessingEffect[];
  private _renderer: WebGPURenderer | null = null;

  constructor(settings: PostProcessingSettings, passes: PostPasses) {
    this.passes = { ...passes };
    this._effects = createEffects(this.passes, settings);
  }

  applySettings(settings: PostProcessingSettings): void {
    for (const effect of this._effects) {
      effect.applySettings?.(settings);
    }
  }

  private setupMRT(scene: Scene, camera: Camera): TextureNode {
    this.scenePass = pass(scene, camera);

    const needsEmissive = this.passes.bloom;
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

  attachDebug(folder: ParametersGroup): ParametersGroup {
    const postFolder = folder.addFolder("Post Processing");

    for (const effect of this._effects) {
      if (!effect.enabled) continue;
      effect.attachDebug?.(postFolder);
    }

    return postFolder;
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
