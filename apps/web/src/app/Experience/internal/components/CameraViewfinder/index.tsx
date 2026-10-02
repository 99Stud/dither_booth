import type { FC } from "react";

import { animate } from "animejs";
import clsx from "clsx";
import { useLayoutEffect, useRef } from "react";

import {
  VIEWFINDER_ENTER_DELAY_MS,
  VIEWFINDER_ENTER_MS,
  VIEWFINDER_EXIT_MS,
} from "../../Experience.motion";
import { cameraFrameClassName } from "../../Experience.styles";

/** Crop marks at the middle of each edge, pointing in at the subject. */
const TICKS = [
  "top-1/2 left-0 h-2 w-5 -translate-y-1/2",
  "top-1/2 right-0 h-2 w-5 -translate-y-1/2",
] as const;

/**
 * Camcorder HUD drawn on the live feed: a frame flush with the picture,
 * edge crop marks, and REC at the top right. Everything rests at opacity 0;
 * anime.js brings it in with the shutter.
 */
export const CameraViewfinder: FC<{ isVisible: boolean }> = (props) => {
  const { isVisible } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const hasEnteredRef = useRef(false);

  useLayoutEffect(() => {
    const root = rootRef.current;

    if (!root || (!isVisible && !hasEnteredRef.current)) return;

    if (isVisible) hasEnteredRef.current = true;

    const chrome = root.querySelectorAll<HTMLElement>("[data-chrome]");

    const animation = animate(chrome, {
      opacity: isVisible ? { from: 0, to: 1 } : 0,
      duration: isVisible ? VIEWFINDER_ENTER_MS : VIEWFINDER_EXIT_MS,
      delay: isVisible ? VIEWFINDER_ENTER_DELAY_MS : 0,
      ease: "outQuad",
    });

    return () => {
      animation.pause();
    };
  }, [isVisible]);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="pointer-events-none absolute inset-0"
    >
      <div
        data-chrome
        className={clsx(cameraFrameClassName, "opacity-0")}
      />
      <div className="absolute inset-5">
        {TICKS.map((tick) => (
          <div
            key={tick}
            data-chrome
            className={clsx(
              "absolute bg-white/90 opacity-0",
              "drop-shadow-glow",
              tick,
            )}
          />
        ))}
      </div>
      <p
        data-chrome
        className={clsx(
          "absolute top-8 right-8",
          "flex items-center gap-3",
          "text-5xl leading-none font-bold uppercase opacity-0",
          "drop-shadow-glow",
        )}
      >
        <span className={clsx("size-4 bg-white/90", "animate-flashing")} />
        rec
      </p>
    </div>
  );
};
