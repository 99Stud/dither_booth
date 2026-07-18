import {
  Webcam,
  type WebcamHandle,
} from "@dither-booth/ui/components/misc/Webcam";
import { NinetyNineStudOutlineLogo } from "@dither-booth/ui/components/svg/99StudOutlineLogo/index";
import { DitherBoothLogo } from "@dither-booth/ui/components/svg/DitherBoothLogo/index";
import { ElTonyMateLogo } from "@dither-booth/ui/components/svg/ElTonyMateLogo/index";
import { Button } from "@dither-booth/ui/components/ui/button";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import { createUserMediaReporters } from "@dither-booth/ui/lib/hooks/user-media";
import { takeSquarePhotoAndFlipHorizontally } from "@dither-booth/ui/lib/image-manipulation";
import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { Fragment, useCallback, useEffect, useReducer, useRef } from "react";

import { InteractiveBackground } from "#components/misc/InteractiveBackground/index";
import { WEB_CAMERA_LOG_SOURCE } from "#lib/constants";
import { requestKioskFullscreen } from "#lib/kiosk-fullscreen";
import { reportKioskError } from "#lib/logging/logging.utils";
import { queryClient, useTRPC } from "#lib/trpc/trpc.client";

import {
  experienceReducer,
  initialExperienceState,
  LOTTERY_PENDING_MS,
  PRINT_SUCCESS_AUTO_RESET_MS,
  type ExperiencePhase,
} from "./internal/experience-machine";
import {
  formatLastWinAt,
  getRarityReveal,
} from "./internal/lottery-reveal.utils";

const INTERACTIVE_BACKGROUND_OPTIONS = {
  fluidBackground: {
    simRes: 128,
    dyeRes: 512,
    iterations: 2,
    idleFrames: 240,
  },
};

const {
  reportUserMediaCameraStateChange,
  reportUserMediaConstraintFallbackError,
} = createUserMediaReporters({ source: WEB_CAMERA_LOG_SOURCE });

const COUNTDOWN_INTERVAL_MS = 1000;
const RESTART_COUNTDOWN_INTERVAL_MS = 1000;
const STRIKE_A_POSE_DURATION_SECONDS = 0;

const CAMERA_VISIBLE_PHASES = new Set<ExperiencePhase>([
  "cameraEntering",
  "promptEntering",
  "countdown",
  "smile",
  "capturing",
  "printing",
  "printSucceeded",
]);

const PROMPT_VISIBLE_PHASES = new Set<ExperiencePhase>([
  "promptEntering",
  "countdown",
  "smile",
  "capturing",
  "printing",
]);

export const Experience = () => {
  const [state, dispatch] = useReducer(
    experienceReducer,
    initialExperienceState,
  );
  const {
    activePrintAttemptId,
    countdown,
    drawResult,
    phase,
    restartCountdown,
    showLotteryResult,
  } = state;

  const trpc = useTRPC();

  const { data: lotteryStatus } = useQuery(
    trpc.getLotteryStatus.queryOptions(),
  );

  const { mutateAsync: printReceiptImage } = useMutation(
    trpc.printReceipt.mutationOptions(),
  );

  const webcamRef = useRef<WebcamHandle>(null);

  const handleStartExperience = useCallback(() => {
    void requestKioskFullscreen();
    dispatch({ type: "startRequested" });
  }, []);

  const handleRestartExperience = useCallback(() => {
    dispatch({ type: "restartRequested" });
  }, []);

  const takeSquarePhoto = useCallback(async () => {
    return await takeSquarePhotoAndFlipHorizontally(
      WEB_CAMERA_LOG_SOURCE,
      async () => {
        if (!webcamRef.current) {
          throw new Error("Camera is not available.");
        }

        return await webcamRef.current.takePhoto();
      },
    );
  }, []);

  useEffect(() => {
    if (phase !== "introExiting") return;

    const prewarmPromise = webcamRef.current?.prewarmPhotoCapture();
    void prewarmPromise?.catch(() => undefined);
  }, [phase]);

  useEffect(() => {
    if (activePrintAttemptId === null) return;

    let cancelled = false;

    const printReceipt = async () => {
      try {
        const squarePhoto = await takeSquarePhoto();

        if (cancelled) return;

        dispatch({
          type: "photoCaptured",
          printAttemptId: activePrintAttemptId,
        });
        const nextDrawResult = await printReceiptImage(squarePhoto);

        if (cancelled) return;

        dispatch({
          type: "printSucceeded",
          printAttemptId: activePrintAttemptId,
          drawResult: nextDrawResult,
        });
        void queryClient.invalidateQueries(
          trpc.getLotteryStatus.queryFilter(),
        );
      } catch (error) {
        if (cancelled) return;

        reportKioskError(error, {
          event: "experience-print-receipt-failed",
          source: WEB_CAMERA_LOG_SOURCE,
          userMessage: "Print receipt failed.",
        });
        dispatch({
          type: "printFailed",
          printAttemptId: activePrintAttemptId,
        });
      }
    };

    void printReceipt();

    return () => {
      cancelled = true;
    };
  }, [activePrintAttemptId, printReceiptImage, takeSquarePhoto, trpc.getLotteryStatus]);

  useEffect(() => {
    if (phase !== "countdown") return;

    const intervalId = window.setInterval(() => {
      dispatch({ type: "countdownTicked" });
    }, COUNTDOWN_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [phase]);

  useEffect(() => {
    if (phase !== "printSucceeded") return;

    const lotteryTimeoutId = window.setTimeout(() => {
      dispatch({ type: "lotteryRevealElapsed" });
    }, LOTTERY_PENDING_MS);
    const resetTimeoutId = window.setTimeout(() => {
      dispatch({ type: "autoResetElapsed" });
    }, PRINT_SUCCESS_AUTO_RESET_MS);

    return () => {
      window.clearTimeout(lotteryTimeoutId);
      window.clearTimeout(resetTimeoutId);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "idle") return;

    void queryClient.invalidateQueries(trpc.getLotteryStatus.queryFilter());
  }, [phase, trpc.getLotteryStatus]);

  useEffect(() => {
    if (!showLotteryResult) return;

    const intervalId = window.setInterval(() => {
      dispatch({ type: "restartCountdownTicked" });
    }, RESTART_COUNTDOWN_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [showLotteryResult]);

  const handleStartButtonAnimationComplete = useCallback(() => {
    dispatch({ type: "startButtonAnimationCompleted" });
  }, []);

  const handleCameraAnimationComplete = useCallback(() => {
    dispatch({ type: "cameraAnimationCompleted" });
  }, []);

  const handlePromptAnimationComplete = useCallback(() => {
    dispatch({ type: "promptAnimationCompleted" });
  }, []);

  const handlePromptTextAnimationComplete = useCallback(() => {
    dispatch({ type: "promptTextAnimationCompleted" });
  }, []);

  const promptText =
    phase === "smile" || phase === "capturing"
      ? "strike a pose :)"
      : phase === "printing"
        ? "printing..."
        : "stay in the frame";
  const isIntroDecorationsVisible =
    phase === "idle" ||
    phase === "resetting" ||
    phase === "resettingButtonRepositioning" ||
    phase === "resettingButtonRevealing";
  const isStartButtonAtOrigin =
    phase === "idle" ||
    phase === "resettingButtonRepositioning" ||
    phase === "resettingButtonRevealing";
  const isStartButtonVisible =
    phase === "idle" ||
    phase === "introExiting" ||
    phase === "resettingButtonRevealing";
  const isCameraVisible = CAMERA_VISIBLE_PHASES.has(phase);
  const isPromptVisible = PROMPT_VISIBLE_PHASES.has(phase);
  const isPrintSuccessVisible = phase === "printSucceeded";

  const remainingLots = lotteryStatus?.remainingLots ?? 0;
  const rarityBreakdown = lotteryStatus?.rarityBreakdown ?? [];
  const lastWinLabel = formatLastWinAt(lotteryStatus?.lastWinAt ?? null);
  const totalDraws = lotteryStatus?.totalDraws ?? 0;
  const winReveal =
    drawResult?.outcome === "win"
      ? getRarityReveal(drawResult.prize.rarity)
      : null;
  const WinIcon = winReveal?.Icon;

  return (
    <>
      <InteractiveBackground options={INTERACTIVE_BACKGROUND_OPTIONS} />
      <motion.div
        animate={{ opacity: isIntroDecorationsVisible ? 1 : 0 }}
        className={clsx(
          "fixed top-16 left-16 z-10",
          "flex flex-col gap-2",
          "font-bit text-white/90 text-shadow-[0_0_4px_rgb(255,255,255)]",
        )}
      >
        <DitherBoothLogo
          className={clsx(
            "h-20",
            "fill-white/90",
            "drop-shadow-[0px_0px_8px_rgba(255,255,255,0.75)]",
          )}
        />
        <p className={clsx("text-4xl")}>
          powered by <span className={clsx("font-bold")}>99stud</span>™
        </p>
      </motion.div>
      <motion.div
        animate={{
          translateX: isStartButtonAtOrigin ? 0 : "-100vw",
          opacity: isStartButtonVisible ? 1 : 0,
          scale: isStartButtonVisible ? 1 : 0.9,
          transition: {
            duration: 0.4,
          },
        }}
        onAnimationComplete={handleStartButtonAnimationComplete}
        className={clsx(
          "fixed inset-0 m-auto",
          "h-min w-min",
          "font-bit text-shadow-[0_0_4px_rgb(255,255,255)]",
        )}
      >
        <Button
          disabled={phase !== "idle"}
          onClick={handleStartExperience}
          size="lg"
          className={clsx(
            "h-18 px-6",
            "cursor-pointer border border-white/50 bg-primary/60 backdrop-blur-sm",
            "shadow-[0px_0px_24px_0px_rgba(255,255,255,0.5)]",
          )}
        >
          <span
            className={clsx(
              "translate-y-1 text-5xl leading-none font-bold uppercase",
            )}
          >
            start the experience
          </span>
        </Button>
      </motion.div>
      <motion.div
        animate={{ opacity: isIntroDecorationsVisible ? 1 : 0 }}
        className={clsx(
          "fixed bottom-16 left-16 z-10",
          "flex items-center gap-4",
        )}
      >
        <NinetyNineStudOutlineLogo
          className={clsx(
            "h-20",
            "drop-shadow-[0px_0px_8px_rgba(255,255,255,0.75)]",
          )}
        />
        <ElTonyMateLogo
          className={clsx(
            "fill-white/90",
            "h-20",
            "drop-shadow-[0px_0px_8px_rgba(255,255,255,0.75)]",
          )}
        />
      </motion.div>
      <motion.div
        animate={{ opacity: isIntroDecorationsVisible ? 1 : 0 }}
        className={clsx(
          "fixed top-16 right-16 z-10",
          "text-end font-bit text-3xl text-white/90",
          "text-shadow-[0_0_4px_rgb(255,255,255)]",
        )}
      >
        <p className={clsx("mb-1", "text-4xl font-bold uppercase")}>
          <span className={clsx("animate-flashing")}>$</span> lottery
        </p>
        <div className={clsx("leading-none")}>
          <p className={clsx("mb-2")}>
            <span className={clsx("font-bold")}>{remainingLots}</span>{" "}
            remaining lots
          </p>
          {rarityBreakdown.length > 0 && (
            <ul className={clsx("mb-4")}>
              {rarityBreakdown.map((entry) => {
                const { Icon, label } = getRarityReveal(entry.rarity);
                return (
                  <li key={entry.rarity}>
                    <p className={clsx("flex items-center justify-end gap-2")}>
                      <span className={clsx("font-bold")}>
                        {entry.remaining}x
                      </span>{" "}
                      {label} <Icon className={clsx("size-4.5", "stroke-3")} />
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <p>{lastWinLabel}</p>
          <p>total: {totalDraws} attempts</p>
        </div>
      </motion.div>
      <motion.p
        animate={{ opacity: isIntroDecorationsVisible ? 1 : 0 }}
        className={clsx(
          "fixed right-16 bottom-12 z-10",
          "font-bit text-3xl text-white/90",
          "text-shadow-[0_0_4px_rgb(255,255,255)]",
        )}
      >
        legal_notice
      </motion.p>
      <motion.div
        initial={false}
        className={clsx(
          "relative py-8",
          "h-dvh w-dvw",
          "flex items-center justify-center",
          "font-bit text-white/90 text-shadow-[0_0_4px_rgb(255,255,255)]",
        )}
        animate={{
          translateX: isCameraVisible ? 0 : "100vw",
          transition: {
            duration: 0.4,
          },
        }}
        onAnimationComplete={handleCameraAnimationComplete}
      >
        <motion.div
          initial={false}
          animate={{
            left: isPrintSuccessVisible ? "4rem" : "50%",
            translateX: isPrintSuccessVisible ? 0 : "-50%",
            transition: {
              duration: 0.4,
            },
          }}
          className={clsx("absolute top-8 bottom-8")}
        >
          <Webcam
            ref={webcamRef}
            className={clsx(
              "h-full",
              "shadow-[0px_0px_24px_0px_rgba(0,0,0,0.5)]",
            )}
            onCameraStateChange={reportUserMediaCameraStateChange}
            onConstraintFallbackError={reportUserMediaConstraintFallbackError}
          />
        </motion.div>
        <motion.div
          initial={false}
          animate={{
            opacity: isPromptVisible ? 1 : 0,
            translateY: isPromptVisible ? "-33.33%" : "-100%",
            transition: {
              duration: 0.3,
            },
          }}
          onAnimationComplete={handlePromptAnimationComplete}
          className={clsx(
            "absolute top-8 right-0 left-0 z-10 mx-auto",
            "h-12 w-min px-4",
            "inline-flex items-center justify-center",
            "border border-white/50 bg-primary/60 backdrop-blur-sm",
            "shadow-[0px_0px_24px_0px_rgba(255,255,255,0.5)]",
          )}
        >
          <motion.p
            key={promptText}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration:
                phase === "smile" ? STRIKE_A_POSE_DURATION_SECONDS : 0.2,
            }}
            onAnimationComplete={handlePromptTextAnimationComplete}
            className={clsx(
              "text-4xl leading-none font-bold whitespace-nowrap uppercase",
              "translate-y-0.5",
            )}
          >
            {promptText}
          </motion.p>
        </motion.div>
        <AnimatePresence initial={false}>
          {isPrintSuccessVisible && (
            <motion.div
              key="print-success-panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className={clsx(
                "absolute top-8 right-16 z-10",
                "flex flex-col items-end",
              )}
            >
              <p className={clsx("text-5xl leading-none font-bold uppercase")}>
                your receipt is ready!
              </p>
              <p className={clsx("mb-8", "text-4xl leading-none")}>
                don't forget to take it back
              </p>
              <div className={clsx("mb-1", "flex items-center gap-2")}>
                <AnimatePresence initial={false} mode="wait">
                  {showLotteryResult ? (
                    drawResult?.outcome === "win" && winReveal && WinIcon ? (
                      <Fragment key="lottery-win">
                        <motion.p
                          initial={{ opacity: 0, translateX: 8, scale: 0.9 }}
                          animate={{
                            opacity: 1,
                            translateX: 0,
                            scale: 1,
                          }}
                          style={{ originX: 0.5, originY: 0.5 }}
                          exit={{ opacity: 0, translateX: -8, scale: 0.9 }}
                          className={clsx(
                            "text-4xl leading-none font-bold uppercase",
                          )}
                        >
                          lot - {winReveal.label}
                        </motion.p>
                        <motion.span
                          initial={{
                            opacity: 0,
                            rotate: -90,
                            scale: 0,
                            translateX: 8,
                          }}
                          animate={{
                            rotate: 0,
                            scale: 1,
                            opacity: 1,
                            translateX: 0,
                          }}
                          exit={{
                            opacity: 0,
                            rotate: -90,
                            scale: 0,
                            translateX: -8,
                          }}
                          style={{ originX: 0.5, originY: 0.5 }}
                        >
                          <WinIcon
                            className={clsx(
                              "size-6",
                              "stroke-3",
                              "-translate-y-0.5",
                            )}
                          />
                        </motion.span>
                      </Fragment>
                    ) : (
                      <Fragment key="lottery-loss">
                        <motion.p
                          initial={{ opacity: 0, translateX: 8, scale: 0.9 }}
                          animate={{
                            opacity: 1,
                            translateX: 0,
                            scale: 1,
                          }}
                          style={{ originX: 0.5, originY: 0.5 }}
                          exit={{ opacity: 0, translateX: -8, scale: 0.9 }}
                          className={clsx(
                            "text-4xl leading-none font-bold uppercase",
                          )}
                        >
                          no lot this time
                        </motion.p>
                      </Fragment>
                    )
                  ) : (
                    <Fragment key="lottery-pending">
                      <motion.p
                        initial={{ opacity: 0, translateX: -8, scale: 0.9 }}
                        animate={{ opacity: 1, translateX: 0, scale: 1 }}
                        exit={{ opacity: 0, translateX: 8, scale: 0.9 }}
                        style={{ originX: 0.5, originY: 0.5 }}
                        className={clsx(
                          "text-4xl leading-none font-bold uppercase",
                        )}
                      >
                        $ lottery -{" "}
                        <span className={clsx("animate-flashing")}>
                          draw in progress
                        </span>
                      </motion.p>
                      <motion.span
                        initial={{ opacity: 0, translateX: -8, scale: 0 }}
                        animate={{ opacity: 1, translateX: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0, translateX: 8 }}
                        style={{ originX: 0.5, originY: 0.5 }}
                        className={clsx("inline-flex")}
                      >
                        <Spinner
                          className={clsx(
                            "size-6",
                            "stroke-3",
                            "-translate-y-0.5",
                          )}
                        />
                      </motion.span>
                    </Fragment>
                  )}
                </AnimatePresence>
              </div>
              <AnimatePresence initial={false}>
                {showLotteryResult && (
                  <motion.div
                    className={clsx("flex flex-col items-end")}
                    key="lottery-success-details"
                  >
                    {drawResult?.outcome === "win" ? (
                      <>
                        <motion.p
                          initial={{
                            opacity: 0,
                            translateX: 8,
                          }}
                          animate={{
                            opacity: 1,
                            translateX: 0,
                            transition: { delay: 0.6 },
                          }}
                          exit={{ opacity: 0, translateX: -8 }}
                          className={clsx(
                            "mb-2",
                            "flex items-center justify-end gap-2",
                            "text-4xl leading-none",
                          )}
                        >
                          congratulations, you just won a lot!
                        </motion.p>
                        <motion.p
                          initial={{
                            opacity: 0,
                            translateX: 8,
                          }}
                          animate={{
                            opacity: 1,
                            translateX: 0,
                            transition: { delay: 0.7 },
                          }}
                          exit={{ opacity: 0, translateX: -8 }}
                          className={clsx(
                            "text-4xl leading-none font-bold",
                            "mb-4",
                          )}
                        >
                          {drawResult.prize.winDescription}
                        </motion.p>
                        <motion.p
                          initial={{
                            opacity: 0,
                            translateX: 8,
                          }}
                          animate={{
                            opacity: 1,
                            translateX: 0,
                            transition: { delay: 0.8 },
                          }}
                          exit={{ opacity: 0, translateX: -8 }}
                          className={clsx(
                            "mb-6",
                            "text-4xl leading-none font-bold",
                          )}
                        >
                          take your{" "}
                          <span className={clsx("uppercase")}>winning</span>{" "}
                          ticket
                        </motion.p>
                      </>
                    ) : (
                      <>
                        <motion.p
                          initial={{
                            opacity: 0,
                            translateX: 8,
                          }}
                          animate={{
                            opacity: 1,
                            translateX: 0,
                            transition: { delay: 0.6 },
                          }}
                          exit={{ opacity: 0, translateX: -8 }}
                          className={clsx(
                            "mb-2",
                            "flex items-center justify-end gap-2",
                            "text-4xl leading-none",
                          )}
                        >
                          better luck next time
                        </motion.p>
                        <motion.p
                          initial={{
                            opacity: 0,
                            translateX: 8,
                          }}
                          animate={{
                            opacity: 1,
                            translateX: 0,
                            transition: { delay: 0.7 },
                          }}
                          exit={{ opacity: 0, translateX: -8 }}
                          className={clsx(
                            "text-4xl leading-none font-bold",
                            "mb-6",
                          )}
                        >
                          take your ticket
                        </motion.p>
                      </>
                    )}
                    <motion.div
                      initial={{
                        opacity: 0,
                        translateX: 8,
                      }}
                      animate={{
                        opacity: 1,
                        translateX: 0,
                        transition: { delay: 1 },
                      }}
                      exit={{ opacity: 0, translateX: -8 }}
                    >
                      <Button
                        onClick={handleRestartExperience}
                        size="lg"
                        className={clsx(
                          "h-12 px-4",
                          "cursor-pointer border border-white/50 bg-primary/60 backdrop-blur-sm",
                          "shadow-[0px_0px_24px_0px_rgba(255,255,255,0.5)]",
                        )}
                      >
                        <span
                          className={clsx(
                            "translate-y-0.5 text-3xl leading-none font-bold uppercase",
                          )}
                        >
                          restart{" "}
                          <span className={clsx("ml-0.5", "tabular-nums")}>
                            {restartCountdown}
                          </span>
                        </span>
                      </Button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false} mode="popLayout">
          {countdown !== null && (
            <motion.p
              key={countdown}
              initial={{ opacity: 0, translateY: 24, scale: 0.65 }}
              animate={{ opacity: 1, translateY: 0, scale: 1 }}
              exit={{ opacity: 0, translateY: -24, scale: 0.65 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              style={{ originX: 0.5, originY: 0.5 }}
              className={clsx(
                "z-10",
                "absolute",
                "font-bit text-9xl leading-none font-bold text-white/90 uppercase",
                "text-shadow-[0_0_4px_rgb(255,255,255)]",
              )}
            >
              {countdown}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
};
