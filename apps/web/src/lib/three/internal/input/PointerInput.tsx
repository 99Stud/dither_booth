import type { PointerSplat } from "./PointerInput.types";

export class PointerInput {
  x = 0;
  y = 0;

  private _prevX = 0;
  private _prevY = 0;
  private _initialized = false;
  private readonly _target: HTMLElement;
  private _splats: PointerSplat[] = [];
  private static readonly POINTER_FORCE = 2500;
  private static readonly TAP_FORCE = 0.35;

  constructor(target: HTMLElement) {
    this._target = target;
    target.addEventListener("pointerdown", this._onPointerDown, {
      passive: true,
    });
    target.addEventListener("pointermove", this._onPointerMove, {
      passive: true,
    });
    target.addEventListener("touchmove", this._onTouchMove, { passive: true });
  }

  drainSplats(): PointerSplat[] {
    const out = this._splats;
    this._splats = [];
    return out;
  }

  dispose(): void {
    this._target.removeEventListener("pointerdown", this._onPointerDown);
    this._target.removeEventListener("pointermove", this._onPointerMove);
    this._target.removeEventListener("touchmove", this._onTouchMove);
  }

  private _update(clientX: number, clientY: number, forceSplat = false): void {
    const rect = this._target.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    this.x = (clientX - rect.left) / width;
    this.y = 1 - (clientY - rect.top) / height;

    if (!this._initialized) {
      this._prevX = clientX;
      this._prevY = clientY;
      this._initialized = true;
      if (!forceSplat) return;
    }

    const deltaX = (clientX - this._prevX) / width;
    const deltaY = (clientY - this._prevY) / height;

    this._prevX = clientX;
    this._prevY = clientY;

    if (forceSplat || Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) {
      this._splats.push({
        x: this.x,
        y: this.y,
        dx: forceSplat
          ? PointerInput.TAP_FORCE
          : deltaX * PointerInput.POINTER_FORCE,
        dy: forceSplat
          ? PointerInput.TAP_FORCE
          : deltaY * -PointerInput.POINTER_FORCE,
      });
    }
  }

  private readonly _onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    this._update(event.clientX, event.clientY, true);
  };

  private readonly _onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    this._update(event.clientX, event.clientY);
  };

  private readonly _onTouchMove = (event: TouchEvent): void => {
    const touch = event.touches[0];
    if (touch) this._update(touch.clientX, touch.clientY);
  };
}
