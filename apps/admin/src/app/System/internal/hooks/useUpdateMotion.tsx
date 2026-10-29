import { animate, stagger, svg } from "animejs";
import { useEffect, useLayoutEffect, useRef } from "react";

import {
  UPDATE_RESULT_DRAW_EASE,
  UPDATE_RESULT_DRAW_MS,
  UPDATE_STEP_ATTRIBUTE,
  UPDATE_STEP_ICON_ATTRIBUTE,
  UPDATE_STEP_POP_EASE,
  UPDATE_STEP_POP_FROM_SCALE,
  UPDATE_STEP_POP_MS,
  UPDATE_STEP_SLIDE_PX,
  UPDATE_STEPS_STAGGER_MS,
} from "../System.motion";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const canAnimate = (reduced: boolean) =>
  !reduced && document.visibilityState !== "hidden";

/**
 * The step list of a running job: its rows settle in once, then each time
 * the job moves on, the step that ended pops its check and the new one
 * slides in. A refetch that changes nothing replays nothing.
 */
export function useStepAdvance<T extends HTMLElement>(currentIndex: number) {
  const ref = useRef<T>(null);
  const previous = useRef<number | null>(null);
  const reduced = usePrefersReducedMotion();

  useLayoutEffect(() => {
    const list = ref.current;
    const was = previous.current;
    previous.current = currentIndex;

    if (!list || !canAnimate(reduced) || was === currentIndex) return;

    const rows = list.querySelectorAll<HTMLElement>(
      `[${UPDATE_STEP_ATTRIBUTE}]`,
    );

    if (was === null) {
      const entrance = animate(rows, {
        opacity: [0, 1],
        translateX: [-UPDATE_STEP_SLIDE_PX, 0],
        duration: UPDATE_STEP_POP_MS,
        delay: stagger(UPDATE_STEPS_STAGGER_MS),
        ease: "outCubic",
      });
      return () => {
        entrance.revert();
      };
    }

    const ended = rows[currentIndex - 1]?.querySelector(
      `[${UPDATE_STEP_ICON_ATTRIBUTE}]`,
    );
    const animations = [
      ended &&
        animate(ended, {
          scale: [UPDATE_STEP_POP_FROM_SCALE, 1],
          duration: UPDATE_STEP_POP_MS,
          ease: UPDATE_STEP_POP_EASE,
        }),
      rows[currentIndex] &&
        animate(rows[currentIndex], {
          translateX: [UPDATE_STEP_SLIDE_PX, 0],
          opacity: [0.4, 1],
          duration: UPDATE_STEP_POP_MS,
          ease: "outCubic",
        }),
    ];

    return () => {
      for (const animation of animations) animation?.complete();
    };
  }, [currentIndex, reduced]);

  return ref;
}

/** The returned SVG's paths draw themselves once, when `play` turns true. */
export function useDrawOnce<T extends SVGSVGElement>(play: boolean) {
  const ref = useRef<T>(null);
  const played = useRef(false);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const element = ref.current;
    if (!play || played.current || !element) return;
    played.current = true;
    if (!canAnimate(reduced)) return;

    const animation = animate(
      svg.createDrawable(element.querySelectorAll("path, circle")),
      {
        draw: ["0 0", "0 1"],
        duration: UPDATE_RESULT_DRAW_MS,
        ease: UPDATE_RESULT_DRAW_EASE,
        delay: stagger(UPDATE_RESULT_DRAW_MS / 3),
      },
    );

    return () => {
      animation.complete();
    };
  }, [play, reduced]);

  return ref;
}
