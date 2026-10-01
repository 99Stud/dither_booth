import type { LotteryStatus } from "@dither-booth/shared/lottery";

import { NinetyNineStudOutlineLogo } from "@dither-booth/ui/components/svg/99StudOutlineLogo/index";
import { DitherBoothLogo } from "@dither-booth/ui/components/svg/DitherBoothLogo/index";
import clsx from "clsx";
import { motion } from "motion/react";
import { Gift } from "pixelarticons/react/Gift.js";

import { SLIDE_TRANSITION } from "../../Experience.motion";
import { formatLastWinAt, getRarityReveal } from "../../lottery-reveal.utils";

export const IntroChrome = ({
  isVisible,
  lotteryStatus,
}: {
  isVisible: boolean;
  lotteryStatus: LotteryStatus | undefined;
}) => {
  const remainingLots = lotteryStatus?.remainingLots ?? 0;
  const rarityBreakdown = lotteryStatus?.rarityBreakdown ?? [];
  const lastWinLabel = formatLastWinAt(lotteryStatus?.lastWinAt ?? null);
  const totalDraws = lotteryStatus?.totalDraws ?? 0;

  return (
    <motion.div
      initial={false}
      animate={{ opacity: isVisible ? 1 : 0 }}
      // Shares the camera/button slide timing: the chrome always fades in or out
      // alongside whichever slide it accompanies.
      transition={SLIDE_TRANSITION}
      className="pointer-events-none fixed inset-0 z-10"
    >
      <div
        className={clsx(
          "absolute top-14 left-14",
          "flex flex-col gap-2",
          "font-bit text-white/90 text-shadow-glow",
        )}
      >
        <DitherBoothLogo
          className={clsx("h-20", "fill-white/90", "drop-shadow-glow")}
        />
        <p className={clsx("text-4xl")}>
          powered by <span className={clsx("font-bold")}>99stud</span>™
        </p>
      </div>
      <div
        className={clsx(
          "absolute bottom-14 left-14",
          "flex items-center gap-4",
        )}
      >
        <NinetyNineStudOutlineLogo
          className={clsx("h-20", "drop-shadow-glow")}
        />
      </div>
      <div
        className={clsx(
          "absolute top-14 right-14",
          "text-end font-bit text-4xl text-white/90",
          "text-shadow-glow",
        )}
      >
        <p
          className={clsx(
            "mb-2 flex items-center justify-end gap-2",
            "text-5xl font-bold uppercase",
          )}
        >
          <Gift
            aria-hidden
            className={clsx(
              "size-8 shrink-0",
              "mb-2 animate-flashing drop-shadow-[0_0_4px_rgb(255_255_255)]",
            )}
          />
          lottery
        </p>
        <div className={clsx("leading-none")}>
          <p className={clsx("mb-2", "font-bold")}>
            <span className={clsx("font-bold")}>{remainingLots}</span> remaining
            prizes
          </p>
          {rarityBreakdown.length > 0 && (
            <ul className={clsx("mb-4")}>
              {rarityBreakdown.map((entry) => {
                const { Icon, label } = getRarityReveal(entry.rarity);

                return (
                  <li key={entry.rarity}>
                    <p
                      className={clsx(
                        "flex items-center justify-end gap-2 font-bold",
                      )}
                    >
                      <span>{entry.remaining}x</span> {label}{" "}
                      <Icon className={clsx("size-6 shrink-0")} />
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <p>{lastWinLabel}</p>
          <p>total: {totalDraws} attempts</p>
        </div>
      </div>
      <p
        className={clsx(
          "absolute right-14 bottom-10",
          "font-bit text-3xl text-white/90",
          "text-shadow-glow",
        )}
      >
        legal_notice
      </p>
    </motion.div>
  );
};
