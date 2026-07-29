import { Button } from "@dither-booth/ui/components/ui/button";
import clsx from "clsx";
import { motion } from "motion/react";

import { SLIDE_TRANSITION } from "../../Experience.motion";
import {
  kioskButtonClassName,
  kioskButtonLabelClassName,
} from "../../Experience.styles";

interface StartExperienceButtonProps {
  disabled: boolean;
  isAtOrigin: boolean;
  isVisible: boolean;
  onAnimationComplete: () => void;
  onStart: () => void;
}

export const StartExperienceButton = ({
  disabled,
  isAtOrigin,
  isVisible,
  onAnimationComplete,
  onStart,
}: StartExperienceButtonProps) => (
  <motion.div
    initial={false}
    animate={{
      x: isAtOrigin ? 0 : "-100vw",
      opacity: isVisible ? 1 : 0,
      scale: isVisible ? 1 : 0.9,
    }}
    transition={SLIDE_TRANSITION}
    onAnimationComplete={onAnimationComplete}
    className={clsx(
      "fixed inset-0 z-20 m-auto",
      "h-min w-min",
      "font-bit text-shadow-glow",
    )}
  >
    <Button
      disabled={disabled}
      onClick={onStart}
      size="lg"
      // `disabled` is only here to swallow taps while the button is mid-slide;
      // the wrapper above already owns opacity, so the default disabled dim
      // would fight it — visibly dimming on the way out and revealing at half
      // opacity before snapping to full once `idle` re-enables the button.
      className={clsx(kioskButtonClassName, "disabled:opacity-100")}
    >
      <span className={clsx(kioskButtonLabelClassName, "translate-y-1")}>
        start the experience
      </span>
    </Button>
  </motion.div>
);
