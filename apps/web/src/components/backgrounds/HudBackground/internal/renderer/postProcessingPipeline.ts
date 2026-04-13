import { ACESFilmicToneMapping as RendererACESFilmicToneMapping, NoToneMapping } from "three";
import type Node from "three/src/nodes/core/Node.js";
import { acesFilmicToneMapping, emissive, float, mrt, output, pass, screenUV } from "three/tsl";
import type { PerspectiveCamera, Scene, WebGPURenderer } from "three/webgpu";
import { RenderPipeline } from "three/webgpu";
import { asciiNode } from "./asciiNode.ts";
import { bloomNode } from "./bloomNode.ts";
import { filmNode } from "./filmNode.ts";
import { scanlinesNode } from "./scanLines.ts";
import { FILM } from "../hudBackground.config.ts";

export class PostProcessingPipeline {
  postProcessing: RenderPipeline | undefined;
  private _renderer: WebGPURenderer | null = null;

  async setup(renderer: WebGPURenderer, scene: Scene, camera: PerspectiveCamera): Promise<void> {
    if (!renderer || !scene || !camera) return;

    this.dispose();

    this.postProcessing = new RenderPipeline(renderer);
    this.postProcessing.outputColorTransform = true;

    this._renderer = renderer;
    renderer.toneMapping = NoToneMapping;

    const scenePass = pass(scene, camera);
    const mrtConfig: Record<string, Node> = {
      output: output as Node,
      emissive: emissive as Node,
    };
    scenePass.setMRT(mrt(mrtConfig));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TSL runtime nodes expose .add() which strict TS types don't surface on the base Node type
    let color: any = scenePass.getTextureNode("output");

    color = asciiNode(color);
    color = color.add(bloomNode(color));

    if (FILM.strength > 0) {
      color = filmNode(color, screenUV);
    }

    color = scanlinesNode(color);

    this.postProcessing.outputNode = acesFilmicToneMapping(color, float(1.0));
  }

  render(): void {
    this.postProcessing?.render();
  }

  dispose(): void {
    if (this._renderer) {
      this._renderer.toneMapping = RendererACESFilmicToneMapping;
      this._renderer = null;
    }
    this.postProcessing?.dispose();
    this.postProcessing = undefined;
  }
}
