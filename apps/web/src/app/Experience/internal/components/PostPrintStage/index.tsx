import type { FC } from "react";

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { Receipt } from "pixelarticons/react/Receipt.js";

import type { ExperiencePhase } from "../../Experience.machine";

import { SLIDE_TRANSITION } from "../../Experience.motion";

export const PostPrintStage: FC<{
  isVisible: boolean;
  phase: ExperiencePhase;
}> = (props) => {
  const { isVisible, phase } = props;

  return (
    <AnimatePresence initial={false} mode="wait">
      {isVisible && (
        <motion.div
          key={phase}
          initial={{ opacity: 0, x: "100vw" }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: "-100vw" }}
          transition={SLIDE_TRANSITION}
          className={clsx(
            "pointer-events-auto absolute inset-0 z-10",
            "flex flex-col items-center justify-center",
          )}
        >
          <Receipt
            aria-hidden
            className={clsx(
              "mb-6 size-16",
              "animate-flashing drop-shadow-glow",
            )}
          />
          <p className={clsx("text-6xl leading-none font-bold uppercase")}>
            your receipt is ready!
          </p>
          <p className={clsx("mt-4 text-5xl leading-none")}>
            don't forget to take it back
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
