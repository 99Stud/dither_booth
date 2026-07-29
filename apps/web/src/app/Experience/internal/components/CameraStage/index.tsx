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
  PROMPT_TEXT_TRANSITION,
  PROMPT_TRANSITION,
  SLIDE_TRANSITION,
} from "../../Experience.motion";
import { glowPanelClassName } from "../../Experience.styles";

const {
  reportUserMediaCameraStateChange,
  reportUserMediaConstraintFallbackError,
} = createUserMediaReporters({ source: WEB_CAMERA_LOG_SOURCE });

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
        "h-12 w-min px-4",
        "inline-flex items-center justify-center",
        glowPanelClassName,
      )}
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.p
          key={promptText}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={PROMPT_TEXT_TRANSITION}
          className={clsx(
            "text-4xl leading-none font-bold whitespace-nowrap uppercase",
            "translate-y-0.5",
          )}
        >
          {promptText}
        </motion.p>
      </AnimatePresence>
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
