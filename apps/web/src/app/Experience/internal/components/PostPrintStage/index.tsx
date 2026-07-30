import { Button } from "@dither-booth/ui/components/ui/button";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";

import type { ExperiencePhase } from "../../Experience.machine";

import { SLIDE_TRANSITION } from "../../Experience.motion";
import {
  kioskButtonClassName,
  kioskButtonLabelClassName,
} from "../../Experience.styles";

interface PostPrintStageProps {
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

const LotteryResultsScreen = () => (
  <>
    <p className={clsx("mb-2", "text-6xl leading-none font-bold uppercase")}>
      winner - A4 poster
    </p>
    <p className={clsx("mb-8", "text-5xl leading-none")}>
      congratulations you won a{" "}
      <span className={clsx("font-bold")}>legendary</span> lot!
    </p>
    <p className={clsx("text-5xl leading-none")}>
      Thanks for playing with us! ♥︎
    </p>
  </>
);

export const PostPrintStage = ({
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
        {phase === "lotteryResults" && <LotteryResultsScreen />}
      </motion.div>
    )}
  </AnimatePresence>
);
