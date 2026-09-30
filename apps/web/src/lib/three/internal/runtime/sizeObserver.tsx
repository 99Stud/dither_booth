import type { ViewportSize } from "./runtime.types";

type SizeListener = (size: ViewportSize) => void;

interface SizeObserverOptions {
  container: HTMLElement;
  pixelRatio: number;
  onResize: SizeListener;
}

export class SizeObserver {
  private readonly _container: HTMLElement;
  private readonly _pixelRatio: number;
  private readonly _onResize: SizeListener;
  private readonly _resizeObserver: ResizeObserver | null;
  private _resizeFrame = 0;

  constructor({ container, pixelRatio, onResize }: SizeObserverOptions) {
    this._container = container;
    this._pixelRatio = pixelRatio;
    this._onResize = onResize;

    this._resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => this._scheduleResize());
  }

  getSize(): ViewportSize {
    const rect = this._container.getBoundingClientRect();
    return {
      width: Math.max(1, Math.round(rect.width || window.innerWidth)),
      height: Math.max(1, Math.round(rect.height || window.innerHeight)),
      pixelRatio: this._pixelRatio,
    };
  }

  observe(): void {
    if (this._resizeObserver) {
      this._resizeObserver.observe(this._container);
      return;
    }

    window.addEventListener("resize", this._handleWindowResize);
  }

  dispose(): void {
    this._resizeObserver?.disconnect();
    window.removeEventListener("resize", this._handleWindowResize);
    if (this._resizeFrame) {
      cancelAnimationFrame(this._resizeFrame);
      this._resizeFrame = 0;
    }
  }

  private readonly _handleWindowResize = (): void => {
    this._scheduleResize();
  };

  private _scheduleResize(): void {
    if (this._resizeFrame) return;
    this._resizeFrame = requestAnimationFrame(() => {
      this._resizeFrame = 0;
      this._onResize(this.getSize());
    });
  }
}
