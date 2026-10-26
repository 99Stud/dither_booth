import type { LotteryStatus } from "@dither-booth/shared/lottery";

import { NinetyNineStudOutlineLogo } from "@dither-booth/ui/components/svg/99StudOutlineLogo/index";
import { DitherBoothLogo } from "@dither-booth/ui/components/svg/DitherBoothLogo/index";
import clsx from "clsx";
import { motion } from "motion/react";
import { Gift } from "pixelarticons/react/Gift.js";

import { KitText } from "#kits/KitText/index";
import { useKitCopy } from "#kits/useKit";

import { SHUTTER_TRANSITION } from "../../Experience.motion";
import { formatLastWinAt, getRarityReveal } from "../../lottery-reveal.utils";

/** Top right of the landing: what is left to win. Only while the lottery is on. */
const LotteryPanel = ({ lotteryStatus }: { lotteryStatus: LotteryStatus }) => {
  const { rarityBreakdown, remainingPrizes, totalDraws } = lotteryStatus;
  const lastWinLabel = formatLastWinAt(lotteryStatus.lastWinAt);
  const copy = useKitCopy();

  return (
    <div
      className={clsx(
        "absolute top-14 right-14",
        "text-end font-bit text-2xl text-white/80",
        "text-shadow-glow",
      )}
    >
      <p
        className={clsx(
          "mb-1 flex items-center justify-end gap-2",
          "text-3xl font-bold uppercase",
        )}
      >
        <Gift
          aria-hidden
          className={clsx(
            "size-5 shrink-0",
            "mb-1 animate-flashing drop-shadow-glow",
          )}
        />
        <KitText text={copy["landing.lotteryTitle"]} />
      </p>
      <div className={clsx("leading-none")}>
        <p className={clsx("mb-1", "font-bold")}>
          <KitText
            text={copy["landing.remainingPrizes"]}
            values={{ count: remainingPrizes }}
          />
        </p>
        {rarityBreakdown.length > 0 && (
          <ul className={clsx("mb-2")}>
            {rarityBreakdown.map((entry) => {
              const { Icon, label } = getRarityReveal(entry.rarity);

              return (
                <li key={entry.rarity}>
                  <p
                    className={clsx(
                      "flex items-center justify-end gap-1.5 font-bold",
                    )}
                  >
                    <span>{entry.remaining}x</span> {label}{" "}
                    <Icon
                      className={clsx("size-4 shrink-0", "drop-shadow-glow")}
                    />
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        <p>{lastWinLabel}</p>
        {copy["landing.totalAttempts"] ? (
          <p>
            <KitText
              text={copy["landing.totalAttempts"]}
              values={{ count: totalDraws }}
            />
          </p>
        ) : null}
      </div>
    </div>
  );
};

export const IntroChrome = ({
  isVisible,
  lotteryStatus,
}: {
  isVisible: boolean;
  lotteryStatus: LotteryStatus | undefined;
}) => {
  const copy = useKitCopy();

  return (
    <motion.div
      initial={false}
      animate={{ opacity: isVisible ? 1 : 0 }}
      transition={SHUTTER_TRANSITION}
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
        {copy["landing.poweredBy"] ? (
          <p className={clsx("text-4xl")}>
            <KitText text={copy["landing.poweredBy"]} />
          </p>
        ) : null}
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
      {lotteryStatus?.enabled ? (
        <LotteryPanel lotteryStatus={lotteryStatus} />
      ) : null}
      {copy["landing.legalNotice"] ? (
        <p
          className={clsx(
            "absolute right-14 bottom-10",
            "font-bit text-3xl text-white/90",
            "text-shadow-glow",
          )}
        >
          <KitText text={copy["landing.legalNotice"]} />
        </p>
      ) : null}
    </motion.div>
  );
};
