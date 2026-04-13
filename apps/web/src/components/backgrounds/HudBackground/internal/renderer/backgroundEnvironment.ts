import { Color, PerspectiveCamera, Scene, SRGBColorSpace, ACESFilmicToneMapping } from "three";
import { WebGPURenderer } from "three/webgpu";
import { FsQuad } from "./fsQuad.ts";
import { FluidSimulation } from "./fluid.ts";
import { Pointer } from "./pointer.ts";
import { PostProcessingPipeline } from "./postProcessingPipeline.ts";

export class BackgroundEnvironment {
  readonly renderer: WebGPURenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  readonly postProcessing: PostProcessingPipeline;
  readonly fsQuad: FsQuad;
  readonly fluid: FluidSimulation;
  readonly pointer: Pointer;

  private _boundResize: () => void;
  private _container: HTMLElement | null = null;
  private _resizeObserver: ResizeObserver | null = null;

  constructor() {
    this.scene = new Scene();
    this.scene.background = new Color(0x000000);

    this.fsQuad = new FsQuad();
    this.scene.add(this.fsQuad);

    this.camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 0, 5);

    this.fluid = new FluidSimulation();
    this.postProcessing = new PostProcessingPipeline();

    this.renderer = new WebGPURenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.sortObjects = false;
    this.renderer.outputColorSpace = SRGBColorSpace;

    this.canvas = this.renderer.domElement;
    this.pointer = new Pointer(this.canvas);

    this._boundResize = this._onResize.bind(this);
    window.addEventListener("resize", this._boundResize);
  }

  async init(): Promise<void> {
    await this.renderer.init();
    this.fluid.init(this.renderer);
    this.fsQuad.init(this.renderer);
    await this.postProcessing.setup(this.renderer, this.scene, this.camera);
  }

  start(): void {
    this.renderer.setAnimationLoop(this._render.bind(this));
  }

  stop(): void {
    this.renderer.setAnimationLoop(null);
  }

  dispose(): void {
    this.stop();
    window.removeEventListener("resize", this._boundResize);
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    this._container = null;
    this.pointer.dispose();
    this.postProcessing.dispose();
    this.fluid.dispose();
    this.fsQuad.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  mountTo(container: HTMLElement): void {
    this._container = container;
    container.appendChild(this.canvas);
    this._resizeObserver = new ResizeObserver(() => {
      this._syncSize();
    });
    this._resizeObserver.observe(container);
    requestAnimationFrame(() => {
      this._syncSize();
    });
  }

  private _render(): void {
    this.fluid.step(this.pointer.drainSplats());
    this.fsQuad.fluidTexture.value = this.fluid.densityTexture;
    this.fsQuad.updateTurbulence();

    if (this.postProcessing.postProcessing) {
      this.postProcessing.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private _onResize(): void {
    this._syncSize();
  }

  private _syncSize(): void {
    const el = this._container;
    let width = el?.clientWidth ?? 0;
    let height = el?.clientHeight ?? 0;
    if (width < 1 || height < 1) {
      width = window.innerWidth;
      height = window.innerHeight;
    }
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.fsQuad.resize(width, height);
  }
}
