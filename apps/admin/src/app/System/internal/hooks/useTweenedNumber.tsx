import { animate, utils } from "animejs";
import { useEffect, useRef, useState } from "react";

import {
  SYSTEM_VALUE_TWEEN_EASE,
  SYSTEM_VALUE_TWEEN_MS,
} from "../System.motion";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/**
 * A number on its way to `target`: each new reading is reached over
 * `SYSTEM_VALUE_TWEEN_MS` from wherever the shown value is, so a figure
 * and the bar beside it move together instead of jumping. The first
 * value, a missing one, and reduced motion are set at once.
 */
export function useTweenedNumber(
  target: number | null,
  decimals = 0,
): number | null {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    const from = shownRef.current;

    if (target === null || from === null || reduced || from === target) {
      shownRef.current = target;
      setShown(target);
      return;
    }

    const tween = { value: from };
    const animation = animate(tween, {
      value: target,
      duration: SYSTEM_VALUE_TWEEN_MS,
      ease: SYSTEM_VALUE_TWEEN_EASE,
      modifier: utils.round(decimals),
      onUpdate: () => {
        shownRef.current = tween.value;
        setShown(tween.value);
      },
    });

    return () => {
      animation.cancel();
    };
  }, [target, reduced, decimals]);

  return shown;
}
