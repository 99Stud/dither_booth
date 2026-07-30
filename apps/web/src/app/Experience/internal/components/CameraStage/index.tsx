import type { RefObject } from "react";

import {
  Webcam,
  type WebcamHandle,
} from "@dither-booth/ui/components/misc/Webcam";
import { createUserMediaReporters } from "@dither-booth/ui/lib/hooks/user-media";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";

import { WEB_CAMERA_LOG_SOURCE } from "#lib/constants";

import {
  COUNTDOWN_TRANSITION,
  PROMPT_PANEL_LAYOUT_TRANSITION,
  PROMPT_TEXT_TRANSITION,
  PROMPT_TRANSITION,
  SLIDE_TRANSITION,
} from "../../Experience.motion";
import { glowPanelClassName } from "../../Experience.styles";

const {
  reportUserMediaCameraStateChange,
  reportUserMediaConstraintFallbackError,
} = createUserMediaReporters({ source: WEB_CAMERA_LOG_SOURCE });

/**
 * The optical nudge that used to be a `translate-y-0.5` class. Motion writes
 * `transform` inline for the swap, which would win over the Tailwind translate,
 * so the offset has to be baked into the animated values instead.
 */
const PROMPT_TEXT_BASELINE_Y = 2;

/** How far the caption travels as it exits upward and the next one rises in. */
const PROMPT_TEXT_SWAP_Y = 10;

interface CameraStageProps {
  countdown: number | null;
  isCameraVisible: boolean;
  isPromptVisible: boolean;
  onCameraAnimationComplete: () => void;
  onPromptAnimationComplete: () => void;
  promptText: string;
  webcamRef: RefObject<WebcamHandle | null>;
}

export const CameraStage = ({
  countdown,
  isCameraVisible,
  isPromptVisible,
  onCameraAnimationComplete,
  onPromptAnimationComplete,
  promptText,
  webcamRef,
}: CameraStageProps) => (
  <motion.div
    initial={false}
    className={clsx("absolute inset-0 py-8")}
    animate={{
      x: isCameraVisible ? 0 : "100vw",
    }}
    transition={SLIDE_TRANSITION}
    onAnimationComplete={onCameraAnimationComplete}
  >
    <div
      className={clsx(
        "absolute top-8 bottom-8 left-1/2 aspect-square",
        "-translate-x-1/2",
      )}
    >
      <Webcam
        ref={webcamRef}
        className={clsx("h-full w-full max-w-none", "shadow-soft")}
        onCameraStateChange={reportUserMediaCameraStateChange}
        onConstraintFallbackError={reportUserMediaConstraintFallbackError}
      />
    </div>
    <motion.div
      initial={false}
      animate={{
        opacity: isPromptVisible ? 1 : 0,
        y: isPromptVisible ? "-33.33%" : "-100%",
      }}
      transition={PROMPT_TRANSITION}
      onAnimationComplete={onPromptAnimationComplete}
      className={clsx(
        "absolute top-8 right-0 left-0 z-10 mx-auto",
        "flex w-min",
      )}
    >
      {/*
        The panel owns `layout` on its own element: layout animations are
        implemented as transforms, so they can't share an element with the
        percentage `y` that shows and hides the panel above.
      */}
      <motion.div
        layout
        transition={PROMPT_PANEL_LAYOUT_TRANSITION}
        className={clsx(
          "h-12 px-4",
          "inline-flex items-center justify-center",
          glowPanelClassName,
        )}
      >
        {/*
          Keyed on the text, not the phase, so the phases that share a caption
          (`smile` and `capturing`) don't re-animate. `mode="wait"` unmounts the
          old caption before the new one mounts, so the panel resize starts once
          the exit is done and the two read as one sequence rather than a
          cross-fade.

          The caption deliberately has no `layout` of its own, so the panel's
          width animation scales it (and the side borders) for the length of
          PROMPT_PANEL_LAYOUT_TRANSITION. That is invisible because the resize
          overlaps the start of the incoming fade, where the caption is still
          near zero opacity; adding `layout` here would instead fight the `y`
          the swap animates.
        */}
        <AnimatePresence initial={false} mode="wait">
          <motion.p
            key={promptText}
            initial={{
              opacity: 0,
              y: PROMPT_TEXT_BASELINE_Y + PROMPT_TEXT_SWAP_Y,
            }}
            animate={{ opacity: 1, y: PROMPT_TEXT_BASELINE_Y }}
            exit={{
              opacity: 0,
              y: PROMPT_TEXT_BASELINE_Y - PROMPT_TEXT_SWAP_Y,
            }}
            transition={PROMPT_TEXT_TRANSITION}
            className={clsx(
              "text-4xl leading-none font-bold whitespace-nowrap uppercase",
            )}
          >
            {promptText}
          </motion.p>
        </AnimatePresence>
      </motion.div>
    </motion.div>
    <AnimatePresence initial={false} mode="popLayout">
      {countdown !== null && (
        <motion.p
          key={countdown}
          initial={{ opacity: 0, y: 24, scale: 0.65 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -24, scale: 0.65 }}
          transition={COUNTDOWN_TRANSITION}
          style={{ originX: 0.5, originY: 0.5 }}
          className={clsx(
            "z-10",
            "absolute inset-0",
            "flex items-center justify-center",
            "font-bit text-9xl leading-none font-bold text-white/90 uppercase",
            "text-shadow-glow",
          )}
        >
          {countdown}
        </motion.p>
      )}
    </AnimatePresence>
  </motion.div>
);
