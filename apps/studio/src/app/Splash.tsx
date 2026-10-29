import { DITHER_BOOTH_MARK } from "@dither-booth/ui/brand";
import {
  createScope,
  createTimeline,
  stagger,
  steps,
  type Timeline,
  utils,
} from "animejs";
import clsx from "clsx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** One pixel of the mark, in its own SVG units. */
const MARK_PIXEL = 58.676;
const GHOST_MS = 360;
/** Each dither pixel's drop into place. */
const PIXEL_DROP_MS = 320;
const PIXEL_GAP_MS = 45;
const EXIT_MS = 280;

const [GHOST, DITHER] = DITHER_BOOTH_MARK.paths;
/** The dither, one square per subpath, so each can fall on its own. */
const PIXELS = DITHER.split(/(?=M)/u);

/** Animation frames don't run on a hidden page, or for reduced motion. */
const shouldAnimate = () =>
  document.visibilityState === "visible" &&
  !matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The launch screen: the mark on the background while Studio finds its
 * session. The ghost steps in, its dither drops into place pixel by pixel,
 * and once `ready` and the entrance is over, the splash fades and `onDone`
 * unmounts it. Reduced motion or a hidden page shows it still, until `ready`.
 */
export const Splash = ({
  ready,
  onDone,
}: {
  ready: boolean;
  onDone: () => void;
}) => {
  const root = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(false);

  useLayoutEffect(() => {
    if (!shouldAnimate()) {
      setEntered(true);
      return;
    }

    let timeline: Timeline | undefined;
    const scope = createScope({ root }).add(() => {
      // Hidden before the first paint: a pixel would show in place until
      // its delay starts.
      utils.set("[data-splash-ghost], [data-splash-pixel]", { opacity: 0 });
      timeline = createTimeline({ onComplete: () => setEntered(true) })
        .add("[data-splash-ghost]", {
          opacity: [0, 1],
          translateY: [MARK_PIXEL, 0],
          duration: GHOST_MS,
          ease: steps(3),
        })
        .add(
          "[data-splash-pixel]",
          {
            opacity: [0, 1],
            translateY: [-MARK_PIXEL, 0],
            duration: PIXEL_DROP_MS,
            ease: steps(3),
            delay: stagger(PIXEL_GAP_MS, { from: "random" }),
          },
          `-=${GHOST_MS / 2}`,
        );
    });

    // Hidden mid-way (a locked phone, a switched app): land it now.
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") timeline?.complete();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      scope.revert();
    };
  }, []);

  useEffect(() => {
    if (!ready || !entered) return;

    if (!shouldAnimate()) {
      onDone();
      return;
    }

    const timeline = createTimeline({ onComplete: onDone }).add(root.current!, {
      opacity: [1, 0],
      duration: EXIT_MS,
      ease: "out(2)",
    });

    return () => {
      timeline.revert();
    };
  }, [ready, entered, onDone]);

  return (
    <div
      ref={root}
      role="status"
      aria-label="Studio is loading"
      className={clsx(
        "fixed inset-0 z-50 flex items-center justify-center",
        "bg-background text-foreground",
      )}
    >
      <svg
        aria-hidden
        className={clsx("h-28 w-auto")}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${DITHER_BOOTH_MARK.width} ${DITHER_BOOTH_MARK.height}`}
      >
        <path data-splash-ghost fill="currentColor" d={GHOST} />
        {PIXELS.map((d) => (
          <path key={d} data-splash-pixel fill="currentColor" d={d} />
        ))}
      </svg>
    </div>
  );
};
