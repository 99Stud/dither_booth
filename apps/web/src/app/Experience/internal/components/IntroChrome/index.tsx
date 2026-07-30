import { NinetyNineStudOutlineLogo } from "@dither-booth/ui/components/svg/99StudOutlineLogo/index";
import { DitherBoothLogo } from "@dither-booth/ui/components/svg/DitherBoothLogo/index";
import { ElTonyMateLogo } from "@dither-booth/ui/components/svg/ElTonyMateLogo/index";
import clsx from "clsx";
import { motion } from "motion/react";

import { SLIDE_TRANSITION } from "../../Experience.motion";

interface IntroChromeProps {
  isVisible: boolean;
}

export const IntroChrome = ({ isVisible }: IntroChromeProps) => (
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
      className={clsx("absolute bottom-14 left-14", "flex items-center gap-4")}
    >
      <NinetyNineStudOutlineLogo className={clsx("h-20", "drop-shadow-glow")} />
      <ElTonyMateLogo
        className={clsx("fill-white/90", "h-20", "drop-shadow-glow")}
      />
    </div>
    <div
      className={clsx(
        "absolute top-14 right-14",
        "text-end font-bit text-4xl text-white/90",
        "text-shadow-glow",
      )}
    >
      <p className={clsx("mb-2", "text-5xl font-bold uppercase")}>
        <span className={clsx("animate-flashing")}>$</span> lottery
      </p>
      <div className={clsx("leading-none")}>
        <ul>
          <li>
            <p className={clsx("flex items-center justify-end gap-2")}>
              <span className={clsx("font-bold")}>100x</span>stickers
            </p>
          </li>
          <li>
            <p className={clsx("flex items-center justify-end gap-2")}>
              <span className={clsx("font-bold")}>20x</span>posters
            </p>
          </li>
          <li>
            <p className={clsx("flex items-center justify-end gap-2")}>
              <span className={clsx("font-bold")}>8x</span>water guns
            </p>
          </li>
        </ul>
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
