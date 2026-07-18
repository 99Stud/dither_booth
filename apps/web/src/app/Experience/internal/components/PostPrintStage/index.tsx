import type { DrawResult } from "@dither-booth/shared/lottery";

import { Button } from "@dither-booth/ui/components/ui/button";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";

import type { ExperiencePhase } from "../../Experience.machine";

import { SLIDE_TRANSITION } from "../../Experience.motion";
import {
  kioskButtonClassName,
  kioskButtonLabelClassName,
} from "../../Experience.styles";
import { getRarityReveal } from "../../lottery-reveal.utils";

interface PostPrintStageProps {
  drawResult: DrawResult | null;
  entersInPlace: boolean;
  isVisible: boolean;
  onPlayLottery: () => void;
  phase: ExperiencePhase;
}

const ReceiptReadyScreen = ({
  onPlayLottery,
}: {
  onPlayLottery: () => void;
}) => (
  <>
    <p className={clsx("text-6xl leading-none font-bold uppercase")}>
      your receipt is ready!
    </p>
    <p className={clsx("mb-8", "text-5xl leading-none")}>
      don't forget to take it back
    </p>
    <Button onClick={onPlayLottery} size="lg" className={kioskButtonClassName}>
      <span className={clsx(kioskButtonLabelClassName, "translate-y-0.5")}>
        play the lottery&nbsp;
        <span className={clsx("animate-flashing")}>$</span>
      </span>
    </Button>
  </>
);

const CashMachineScreen = () => (
  <>
    <p className={clsx("text-6xl leading-none font-bold uppercase")}>
      $ cash machine
    </p>
    <p className={clsx("text-5xl leading-none")}>
      <span className={clsx("animate-flashing")}>processing…</span>
    </p>
  </>
);

const LotteryResultsScreen = ({
  drawResult,
}: {
  drawResult: DrawResult | null;
}) => {
  if (drawResult?.outcome === "win") {
    const winReveal = getRarityReveal(drawResult.prize.rarity);

    return (
      <>
        <p className={clsx("mb-2", "text-6xl leading-none font-bold uppercase")}>
          lot - {winReveal.label}
        </p>
        <p className={clsx("mb-8", "text-5xl leading-none")}>
          congratulations, you just won a lot!
        </p>
        <p className={clsx("mb-4", "text-5xl leading-none font-bold")}>
          {drawResult.prize.title}
        </p>
        <p className={clsx("text-5xl leading-none")}>
          {drawResult.prize.winInstruction}
        </p>
      </>
    );
  }

  return (
    <>
      <p className={clsx("mb-2", "text-6xl leading-none font-bold uppercase")}>
        no lot this time
      </p>
      <p className={clsx("text-5xl leading-none")}>
        Thanks for playing with us! ♥︎
      </p>
    </>
  );
};

export const PostPrintStage = ({
  drawResult,
  entersInPlace,
  isVisible,
  onPlayLottery,
  phase,
}: PostPrintStageProps) => (
  <AnimatePresence initial={false} mode="wait">
    {isVisible && (
      <motion.div
        key={phase}
        initial={{ opacity: 0, x: entersInPlace ? 0 : "100vw" }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: "-100vw" }}
        transition={SLIDE_TRANSITION}
        className={clsx(
          "pointer-events-auto absolute inset-0 z-10",
          "flex flex-col items-center justify-center",
        )}
      >
        {phase === "receiptReady" && (
          <ReceiptReadyScreen onPlayLottery={onPlayLottery} />
        )}
        {phase === "cashMachine" && <CashMachineScreen />}
        {phase === "lotteryResults" && (
          <LotteryResultsScreen drawResult={drawResult} />
        )}
      </motion.div>
    )}
  </AnimatePresence>
);
