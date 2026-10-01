import type { ReactNode, RefObject } from "react";

import {
  Webcam,
  type WebcamHandle,
} from "@dither-booth/ui/components/misc/Webcam";
import { createUserMediaReporters } from "@dither-booth/ui/lib/hooks/user-media";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useLayoutEffect, useRef } from "react";

import { WEB_CAMERA_LOG_SOURCE } from "#lib/constants";

import { FROZEN_PHOTO_SCALE } from "../../Experience.constants";
import {
  COUNTDOWN_TRANSITION,
  PROMPT_TEXT_TRANSITION,
  PROMPT_TRANSITION,
  SLIDE_TRANSITION,
} from "../../Experience.motion";

const {
  reportUserMediaCameraStateChange,
  reportUserMediaConstraintFallbackError,
} = createUserMediaReporters({ source: WEB_CAMERA_LOG_SOURCE });

/** How far the caption travels as it exits upward and the next one rises in. */
const PROMPT_TEXT_SWAP_Y = 10;

interface CameraStageProps {
  /** Overlays that ride along with the camera slide (frozen photo, slot panel). */
  children?: ReactNode;
  countdown: number | null;
  isCameraVisible: boolean;
  /** Live feed hides once the frozen capture takes its place. */
  isLiveFeedVisible: boolean;
  isPromptVisible: boolean;
  onCameraAnimationComplete: () => void;
  onSplitTile: (tilePx: number) => void;
  onPromptAnimationComplete: () => void;
  promptText: string;
  splitTilePx: number;
  webcamRef: RefObject<WebcamHandle | null>;
}

export const CameraStage = ({
  children,
  countdown,
  isCameraVisible,
  isLiveFeedVisible,
  isPromptVisible,
  onCameraAnimationComplete,
  onPromptAnimationComplete,
  onSplitTile,
  promptText,
  splitTilePx,
  webcamRef,
}: CameraStageProps) => {
  const cameraBoxRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = cameraBoxRef.current;

    if (!box) return;

    const measure = () => {
      onSplitTile(box.clientHeight * FROZEN_PHOTO_SCALE);
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(box);

    return () => observer.disconnect();
  }, [onSplitTile]);

  return (
    <motion.div
      initial={false}
      className={clsx("absolute inset-0 py-8")}
      style={{ ["--split-tile" as string]: `${splitTilePx}px` }}
      animate={{
        x: isCameraVisible ? 0 : "100vw",
      }}
      transition={SLIDE_TRANSITION}
      onAnimationComplete={onCameraAnimationComplete}
    >
      <div
        ref={cameraBoxRef}
        className={clsx(
          "absolute top-8 bottom-8 left-1/2 aspect-square",
          "-translate-x-1/2",
          !isLiveFeedVisible && "invisible",
        )}
      >
        <Webcam
          ref={webcamRef}
          className={clsx("h-full w-full max-w-none", "shadow-soft")}
          onCameraStateChange={reportUserMediaCameraStateChange}
          onConstraintFallbackError={reportUserMediaConstraintFallbackError}
        />
      </div>
      {children}
      <motion.div
        initial={false}
        animate={{
          opacity: isPromptVisible ? 1 : 0,
          y: isPromptVisible ? "-33.33%" : "-100%",
        }}
        transition={PROMPT_TRANSITION}
        onAnimationComplete={onPromptAnimationComplete}
        className={clsx(
          "absolute top-8 right-0 left-0 z-20",
          "flex justify-center",
        )}
      >
        {/*
          Keyed on the text, not the phase, so the phases that share a caption
          (`smile` and `capturing`) don't re-animate. `mode="wait"` lets the
          old line leave before the next one rises in.
        */}
        <AnimatePresence initial={false} mode="wait">
          <motion.p
            key={promptText}
            initial={{ opacity: 0, y: PROMPT_TEXT_SWAP_Y }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -PROMPT_TEXT_SWAP_Y }}
            transition={PROMPT_TEXT_TRANSITION}
            className={clsx(
              "text-5xl leading-none font-bold whitespace-nowrap uppercase",
              "drop-shadow-glow",
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
};
