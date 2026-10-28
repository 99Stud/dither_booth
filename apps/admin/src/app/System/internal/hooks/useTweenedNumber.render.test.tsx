import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

/*
 * `animejs` is replaced before the hook loads: each `animate` call is
 * recorded, and the test drives `onUpdate` by hand.
 */

type FakeAnimation = {
  from: number;
  to: number;
  tween: { value: number };
  onUpdate: () => void;
  cancelled: number;
  cancel: () => void;
};

const animations: FakeAnimation[] = [];

mock.module("animejs", () => ({
  animate: (
    tween: { value: number },
    options: { value: number; onUpdate: () => void },
  ) => {
    const animation: FakeAnimation = {
      from: tween.value,
      to: options.value,
      tween,
      onUpdate: options.onUpdate,
      cancelled: 0,
      cancel() {
        animation.cancelled++;
      },
    };

    animations.push(animation);

    return animation;
  },
  utils: { round: () => (value: number) => value },
}));

const { installReducedMotion } =
  await import("#lib/system/system.render-testing");
const { act, renderHook } = await import("#lib/test/render");
const { useTweenedNumber } = await import("./useTweenedNumber");

let restoreMotion: (() => void) | undefined;

beforeEach(() => {
  animations.length = 0;
});

afterEach(() => {
  restoreMotion?.();
  restoreMotion = undefined;
});

/** Moves the running tween to `value`, as a frame would. */
const tick = (animation: FakeAnimation, value: number) => {
  act(() => {
    animation.tween.value = value;
    animation.onUpdate();
  });
};

describe("useTweenedNumber", () => {
  test("sets the first value at once, then tweens from the shown value", () => {
    const { result, rerender } = renderHook(
      ({ target }: { target: number | null }) => useTweenedNumber(target),
      { initialProps: { target: 10 } },
    );

    expect(result.current).toBe(10);
    expect(animations).toHaveLength(0);

    rerender({ target: 20 });

    expect(animations).toHaveLength(1);
    expect(animations[0]).toMatchObject({ from: 10, to: 20 });

    tick(animations[0]!, 15);

    expect(result.current).toBe(15);
  });

  test("cancels the running tween when a new target arrives, and resumes from where it was", () => {
    const { result, rerender } = renderHook(
      ({ target }: { target: number | null }) => useTweenedNumber(target),
      { initialProps: { target: 10 } },
    );

    rerender({ target: 20 });
    tick(animations[0]!, 15);
    rerender({ target: 30 });

    expect(animations[0]!.cancelled).toBe(1);
    expect(animations[1]).toMatchObject({ from: 15, to: 30 });
    expect(result.current).toBe(15);
  });

  test("a missing reading shows at once, and so does the next value after it", () => {
    const { result, rerender } = renderHook(
      ({ target }: { target: number | null }) => useTweenedNumber(target),
      { initialProps: { target: 10 as number | null } },
    );

    rerender({ target: null });

    expect(result.current).toBeNull();

    rerender({ target: 40 });

    expect(result.current).toBe(40);
    expect(animations).toHaveLength(0);
  });

  test("with reduced motion, every value is set at once", () => {
    restoreMotion = installReducedMotion();

    const { result, rerender } = renderHook(
      ({ target }: { target: number | null }) => useTweenedNumber(target),
      { initialProps: { target: 10 } },
    );

    rerender({ target: 20 });

    expect(result.current).toBe(20);
    expect(animations).toHaveLength(0);
  });
});
