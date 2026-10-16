import type { FunctionValue } from "animejs";
import type { FC } from "react";

import { NinetyNineStudOutlineLogo } from "@dither-booth/ui/components/svg/99StudOutlineLogo/index";
import { DitherBoothLogo } from "@dither-booth/ui/components/svg/DitherBoothLogo/index";
import { animate, createScope, steps } from "animejs";
import clsx from "clsx";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";

import { SHUTTER_TRANSITION } from "../../Experience.motion";
import { cameraFrameClassName } from "../../Experience.styles";
import { getBayerRanks } from "./MaintenanceScreen.utils";

const GRID_SIZE = 16;
const CELL_RANKS = getBayerRanks(GRID_SIZE);
/** Grey levels the print steps through, like a 4-bit ordered dither. */
const DITHER_LEVELS = 16;
const CELLS_PER_LEVEL = CELL_RANKS.length / DITHER_LEVELS;
/** One grey level: slow enough to read each pattern, stepped like the reels. */
const LEVEL_MS = 150;
/** Held fully developed, then fully dissolved, before turning back. */
const HOLD_MS = 1_600;

/** Each cell waits for its grey level. Targets come in `CELL_RANKS` order. */
const developDelay: FunctionValue<number> = (_target, index = 0) =>
  Math.floor(CELL_RANKS[index]! / CELLS_PER_LEVEL) * LEVEL_MS;

/**
 * The photo booth's "be right back" screen while staff have it in
 * maintenance. It sits over the live background, under the Darkroom
 * hotspot, and swallows every other tap. A frame "develops" like a print in
 * a tray: its cells light up in ordered-dither order, one grey level at a
 * time, then dissolve back.
 */
export const MaintenanceScreen: FC<{ isVisible: boolean }> = ({
  isVisible,
}) => {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isVisible) return;

    const scope = createScope({
      root,
      mediaQueries: { reducedMotion: "(prefers-reduced-motion: reduce)" },
    }).add((self) => {
      // Reduced motion keeps the half-developed checkerboard it renders with.
      if (self?.matches.reducedMotion) return;

      animate("[data-dither-cell]", {
        opacity: [0, 1],
        duration: LEVEL_MS,
        ease: steps(1),
        delay: developDelay,
        loop: true,
        alternate: true,
        loopDelay: HOLD_MS,
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
        // Dims the live background: the booth reads as paused, the text reads.
        "fixed inset-0 z-[25] bg-black/55",
        "font-bit text-white/90 text-shadow-glow",
        isVisible ? "pointer-events-auto" : "pointer-events-none",
      )}
    >
      <DitherBoothLogo
        className={clsx(
          "absolute top-14 left-14 h-20",
          "fill-white/90 drop-shadow-glow",
        )}
      />
      <div
        role="status"
        className={clsx(
          // Clear of the logos above and below.
          "absolute inset-x-14 top-44 bottom-44",
          "flex flex-col justify-center gap-10",
          "landscape:flex-row landscape:items-end landscape:justify-start landscape:gap-14",
        )}
      >
        <div
          aria-hidden
          className={clsx(
            "relative grid size-[40vmin] shrink-0 grid-cols-16 p-4",
          )}
        >
          <span className={cameraFrameClassName} />
          {CELL_RANKS.map((rank, index) => (
            <span
              key={index}
              data-dither-cell
              className="bg-white/90"
              style={{ opacity: rank < CELL_RANKS.length / 2 ? 1 : 0 }}
            />
          ))}
        </div>
        <div className={clsx("flex flex-col gap-6")}>
          <p className={clsx("max-w-[9ch] text-8xl leading-[0.85] font-bold")}>
            be right{" "}
            <span className={clsx("whitespace-nowrap")}>
              back
              <span
                aria-hidden
                className={clsx(
                  "ml-3 inline-block h-[0.6em] w-[0.4em]",
                  "animate-flashing bg-white/90",
                )}
              />
            </span>
          </p>
          <p
            className={clsx(
              "max-w-[24ch] text-3xl leading-tight text-white/80",
            )}
          >
            the booth is taking a short break. come back in a few minutes.
          </p>
        </div>
      </div>
      <NinetyNineStudOutlineLogo
        className={clsx("absolute bottom-14 left-14 h-20", "drop-shadow-glow")}
      />
    </motion.div>
  );
};
