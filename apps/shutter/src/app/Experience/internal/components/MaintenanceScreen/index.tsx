import type { FC } from "react";

import { DitherBoothLogo } from "@dither-booth/ui/components/svg/DitherBoothLogo/index";
import { animate, createScope, stagger, steps } from "animejs";
import clsx from "clsx";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";

import { KitText } from "#kits/KitText/index";
import { useKitCopy } from "#kits/useKit";

import { SHUTTER_TRANSITION } from "../../Experience.motion";

/** The logo's pixel size, in its own SVG units. */
const LOGO_PIXEL = 25.24;
/** One pixel's trip: lifted out two pixels up, held, dropped back in. */
const PIXEL_HOP_MS = 900;
/** Between two pixels: the whole mark gets reworked in about 6 s. */
const PIXEL_GAP_MS = 130;
const CYCLE_PAUSE_MS = 2_000;

/**
 * The photo booth's "be right back" screen while staff have it in
 * maintenance: the booth's logo, its pixel mark being fixed one pixel at a
 * time, each lifted out and dropped back in place, in random order. Taps go
 * through to the live background behind, so guests can play with it while
 * they wait; the start button stays off.
 */
export const MaintenanceScreen: FC<{ isVisible: boolean }> = ({
  isVisible,
}) => {
  const root = useRef<HTMLDivElement>(null);
  const copy = useKitCopy();

  useEffect(() => {
    if (!isVisible) return;

    const scope = createScope({
      root,
      mediaQueries: { reducedMotion: "(prefers-reduced-motion: reduce)" },
    }).add((self) => {
      if (self?.matches.reducedMotion) return;

      // The mark's pixels are the logo's `rect`s; the wordmark is paths.
      animate("svg rect", {
        translateY: [0, -2 * LOGO_PIXEL, -2 * LOGO_PIXEL, 0],
        opacity: [1, 0.35, 0.35, 1],
        duration: PIXEL_HOP_MS,
        ease: steps(4),
        delay: stagger(PIXEL_GAP_MS, { from: "random" }),
        loop: true,
        loopDelay: CYCLE_PAUSE_MS,
      });
    });

    return () => scope.revert();
  }, [isVisible]);

  return (
    <motion.div
      ref={root}
      initial={false}
      animate={{ opacity: isVisible ? 1 : 0 }}
      transition={SHUTTER_TRANSITION}
      aria-hidden={!isVisible}
      className={clsx(
        // Dims the live background: the booth reads as paused, the text
        // reads. Taps go through to it; only the start button is off.
        "pointer-events-none fixed inset-0 z-[25] bg-black/55",
        "flex flex-col justify-center gap-12 px-14",
        "font-bit text-white/90 text-shadow-glow",
      )}
    >
      <DitherBoothLogo
        className={clsx(
          "w-[80vw] landscape:w-[60vw]",
          "fill-white/90 drop-shadow-glow",
        )}
      />
      <div role="status" className={clsx("flex flex-col gap-4")}>
        <p className={clsx("text-8xl leading-none font-bold")}>
          <KitText text={copy["maintenance.title"]} />
          <span
            aria-hidden
            className={clsx(
              "ml-3 inline-block h-[0.6em] w-[0.15em]",
              "animate-flashing bg-white/90",
            )}
          />
        </p>
        {copy["maintenance.body"] ? (
          <p className={clsx("text-5xl leading-tight text-white/80")}>
            <KitText text={copy["maintenance.body"]} />
          </p>
        ) : null}
      </div>
    </motion.div>
  );
};
