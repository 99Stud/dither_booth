export interface Splat {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export class Pointer {
  x = 0;
  y = 0;
  private _prevX = 0;
  private _prevY = 0;
  private _initialized = false;
  private _splats: Splat[] = [];
  private readonly _boundsElement: HTMLElement;
  private _boundPointerMove: (e: PointerEvent) => void;
  private _boundTouchMove: (e: TouchEvent) => void;

  constructor(boundsElement: HTMLElement) {
    this._boundsElement = boundsElement;
    this._boundPointerMove = this._onPointerMove.bind(this);
    this._boundTouchMove = this._onTouchMove.bind(this);

    window.addEventListener("pointermove", this._boundPointerMove, { passive: true });
    window.addEventListener("touchmove", this._boundTouchMove, { passive: true });
  }

  drainSplats(): Splat[] {
    const out = this._splats;
    this._splats = [];
    return out;
  }

  dispose(): void {
    window.removeEventListener("pointermove", this._boundPointerMove);
    window.removeEventListener("touchmove", this._boundTouchMove);
  }

  private _update(clientX: number, clientY: number): void {
    const rect = this._boundsElement.getBoundingClientRect();
    const bw = rect.width || 1;
    const bh = rect.height || 1;
    this.x = (clientX - rect.left) / bw;
    this.y = 1 - (clientY - rect.top) / bh;

    if (!this._initialized) {
      this._prevX = clientX;
      this._prevY = clientY;
      this._initialized = true;
      return;
    }

    const deltaX = clientX - this._prevX;
    const deltaY = clientY - this._prevY;

    this._prevX = clientX;
    this._prevY = clientY;

    if (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) {
      this._splats.push({ x: this.x, y: this.y, dx: deltaX * 5, dy: deltaY * -5 });
    }
  }

  private _onPointerMove(e: PointerEvent): void {
    if (e.pointerType === "touch") return;
    this._update(e.clientX, e.clientY);
  }

  private _onTouchMove(e: TouchEvent): void {
    const t = e.touches[0];
    if (t) this._update(t.clientX, t.clientY);
  }
}
