import type { DrawResult } from "@dither-booth/shared/lottery";
import type { FC } from "react";

import { animate, createScope } from "animejs";
import clsx from "clsx";
import { Close } from "pixelarticons/react/Close.js";
import { Gift } from "pixelarticons/react/Gift.js";
import { Printer } from "pixelarticons/react/Printer.js";
import { Trophy } from "pixelarticons/react/Trophy.js";
import { useEffect, useMemo, useRef } from "react";

import type { ExperiencePhase } from "../../Experience.machine";

import {
  SLOT_INSTRUCTIONS_SWAP_MS,
  SLOT_STAGE_ENTER_MS,
} from "../../Experience.motion";
import {
  splitTileClassName,
  splitTileEdgeOffset,
} from "../../Experience.styles";
import { useSlotReels } from "../../hooks/useSlotReels";
import { getRarityReveal } from "../../lottery-reveal.utils";
import { getReelFaces, REEL_COUNT } from "../../slot-machine.utils";
import { SlotReel } from "../SlotReel/index";

const RESULT_PHASES: readonly ExperiencePhase[] = ["slotResult"];
const INSTRUCTION_PHASES: readonly ExperiencePhase[] = [
  "instructions",
  "printing",
  "cameraExiting",
];

const resultRowClassName = clsx(
  "flex h-16 items-center justify-center gap-4",
  "text-5xl leading-none font-bold uppercase",
);

const ResultRow: FC<{
  drawResult: DrawResult | null;
  phase: ExperiencePhase;
}> = (props) => {
  const { drawResult, phase } = props;

  if (RESULT_PHASES.includes(phase) && drawResult) {
    if (drawResult.outcome === "win") {
      const { label } = getRarityReveal(drawResult.prize.rarity);

      return (
        <p className={resultRowClassName}>
          <Trophy className="size-12 shrink-0 drop-shadow-glow" aria-hidden />
          <span className="translate-y-0.5">{label} - you win!</span>
        </p>
      );
    }

    return (
      <p className={resultRowClassName}>
        <Close className="size-12 shrink-0 drop-shadow-glow" aria-hidden />
        <span className="translate-y-0.5">no prize this time</span>
      </p>
    );
  }

  return (
    <p className={clsx(resultRowClassName, "font-normal")}>
      <span className="translate-y-0.5 animate-flashing">rolling...</span>
    </p>
  );
};

const printingLine = (
  <p className={clsx(resultRowClassName, "font-normal")}>
    <Printer className="size-12 shrink-0 drop-shadow-glow" aria-hidden />
    <span className="translate-y-0.5 animate-flashing">
      printing your ticket...
    </span>
  </p>
);

const Claim: FC<{
  drawResult: DrawResult | null;
  phase: ExperiencePhase;
}> = (props) => {
  const { drawResult, phase } = props;
  const isPrinting = phase === "printing" || phase === "cameraExiting";

  if (drawResult?.outcome === "win") {
    const { Icon, label } = getRarityReveal(drawResult.prize.rarity);

    return (
      <div className="flex flex-col items-center gap-6 px-4 text-center">
        <p className={resultRowClassName}>
          <Icon className="size-12 shrink-0 drop-shadow-glow" aria-hidden />
          <span className="translate-y-0.5">{label}</span>
        </p>
        <p className="text-5xl leading-none font-bold uppercase">
          {drawResult.prize.title}
        </p>
        <p className="text-4xl leading-snug">
          {drawResult.prize.winInstruction}
        </p>
        {isPrinting && printingLine}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 px-4 text-center">
      <p className={resultRowClassName}>
        <Close className="size-12 shrink-0 drop-shadow-glow" aria-hidden />
        <span className="translate-y-0.5">no prize this time</span>
      </p>
      <p className="text-4xl leading-snug">thanks for playing with us</p>
      {isPrinting && printingLine}
    </div>
  );
};

export const SlotMachineStage: FC<{
  drawResult: DrawResult | null;
  isVisible: boolean;
  onReelsStopped: () => void;
  phase: ExperiencePhase;
}> = (props) => {
  const { drawResult, isVisible, onReelsStopped, phase } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const lotteryRef = useRef<HTMLDivElement>(null);
  const claimRef = useRef<HTMLDivElement>(null);
  const stripRefs = useRef<(HTMLDivElement | null)[]>([]);

  const faces = useMemo(
    () => (drawResult ? getReelFaces(drawResult) : null),
    [drawResult],
  );

  useSlotReels({
    faces,
    isActive: isVisible,
    onReelsStopped,
    rootRef,
    stripRefs,
  });

  useEffect(() => {
    if (!isVisible) return;

    const root = rootRef.current;

    if (!root) return;

    const scope = createScope({ root }).add(() => {
      animate(root, {
        translateX: ["120%", "0%"],
        opacity: [0, 1],
        duration: SLOT_STAGE_ENTER_MS,
        ease: "outQuart",
      });
    });

    return () => scope.revert();
  }, [isVisible]);

  const showClaim = INSTRUCTION_PHASES.includes(phase);

  useEffect(() => {
    if (!showClaim) return;

    const root = rootRef.current;
    const lottery = lotteryRef.current;
    const claim = claimRef.current;

    if (!root || !lottery || !claim) return;

    const scope = createScope({ root }).add(() => {
      animate(lottery, {
        opacity: [1, 0],
        translateY: [0, -28],
        duration: SLOT_INSTRUCTIONS_SWAP_MS,
        ease: "inQuad",
      });
      animate(claim, {
        opacity: [0, 1],
        translateY: [28, 0],
        duration: SLOT_INSTRUCTIONS_SWAP_MS,
        delay: 180,
        ease: "outQuart",
      });
    });

    return () => scope.revert();
  }, [showClaim]);

  if (!isVisible) return null;

  const isWinShown =
    RESULT_PHASES.includes(phase) && drawResult?.outcome === "win";

  return (
    <div
      ref={rootRef}
      style={{ right: splitTileEdgeOffset }}
      className={clsx("z-10 px-6", splitTileClassName)}
    >
      <div
        ref={lotteryRef}
        className="flex h-full flex-col items-center justify-center gap-8"
      >
        <p
          className={clsx(
            "flex items-center gap-3",
            "text-5xl leading-none font-bold tracking-widest uppercase",
          )}
        >
          <Gift
            aria-hidden
            className={clsx(
              "size-8 shrink-0",
              "animate-flashing drop-shadow-glow",
            )}
          />
          lucky booth
          <Gift
            aria-hidden
            className={clsx(
              "size-8 shrink-0",
              "animate-flashing drop-shadow-glow",
            )}
          />
        </p>
        <div className="relative flex gap-2">
          {Array.from({ length: REEL_COUNT }, (_, index) => (
            <SlotReel
              key={index}
              isHighlighted={isWinShown}
              stripRef={(strip) => {
                stripRefs.current[index] = strip;
              }}
            />
          ))}
          <div
            aria-hidden
            className={clsx(
              "pointer-events-none absolute -inset-x-4 top-1/2",
              "border-t border-dashed border-white/70",
            )}
          />
        </div>
        <ResultRow drawResult={drawResult} phase={phase} />
      </div>
      <div
        ref={claimRef}
        className="absolute inset-0 flex items-center justify-center opacity-0"
      >
        <Claim drawResult={drawResult} phase={phase} />
      </div>
    </div>
  );
};
