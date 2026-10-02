import type { FC } from "react";

import { animate } from "animejs";
import clsx from "clsx";
import { motion } from "motion/react";
import { Vercel } from "pixelarticons/react/Vercel.js";
import { useEffect, useRef } from "react";

import { SHUTTER_TRANSITION } from "../../Experience.motion";

/** One half of the idle pulse. Alternate plays it back, so a full breath is twice this. */
const START_PROMPT_PULSE_MS = 900;

export const StartExperienceButton: FC<{
  disabled: boolean;
  isAtOrigin: boolean;
  isVisible: boolean;
  onAnimationComplete: () => void;
  onStart: () => void;
}> = (props) => {
  const { disabled, isAtOrigin, isVisible, onAnimationComplete, onStart } =
    props;
  const labelRef = useRef<HTMLParagraphElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!isVisible || !isAtOrigin) return;

    const label = labelRef.current;
    const icon = iconRef.current;

    if (!label || !icon) return;

    const blink = animate(label, {
      opacity: [1, 0.55],
      duration: START_PROMPT_PULSE_MS,
      ease: "inOutSine",
      loop: true,
      alternate: true,
    });
    const nudge = animate(icon, {
      translateX: [0, 10],
      duration: START_PROMPT_PULSE_MS,
      ease: "inOutSine",
      loop: true,
      alternate: true,
    });

    return () => {
      blink.revert();
      nudge.revert();
    };
  }, [isAtOrigin, isVisible]);

  // The prompt is already at rest and hidden when the landing comes back,
  // so nothing would animate and the reveal would wait on the fallback.
  useEffect(() => {
    if (!isAtOrigin || isVisible) return;

    const frameId = window.requestAnimationFrame(() => {
      onAnimationComplete();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isAtOrigin, isVisible, onAnimationComplete]);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={onStart}
        aria-label="Press to start"
        className={clsx(
          "fixed inset-0 z-20",
          disabled ? "pointer-events-none" : "cursor-pointer",
        )}
      />
      <motion.div
        aria-hidden
        initial={false}
        animate={{
          opacity: isVisible ? 1 : 0,
          scale: isVisible ? 1 : 0.92,
        }}
        transition={SHUTTER_TRANSITION}
        onAnimationComplete={onAnimationComplete}
        className={clsx(
          "pointer-events-none fixed inset-0 z-20",
          "flex items-center justify-center",
          "font-bit text-white/90 text-shadow-glow",
        )}
      >
        <p
          ref={labelRef}
          className={clsx(
            "flex items-center gap-6",
            "text-6xl leading-none font-bold",
          )}
        >
          <span ref={iconRef} className="inline-flex">
            <Vercel className="size-12 shrink-0 rotate-90 drop-shadow-glow" />
          </span>
          <span className="translate-y-1">Press to start</span>
        </p>
      </motion.div>
    </>
  );
};
