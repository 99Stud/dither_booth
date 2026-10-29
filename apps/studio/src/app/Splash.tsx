import {
  BRAND_ICON_BACKGROUND,
  DITHER_BOOTH_MARK,
} from "@dither-booth/ui/brand";
import {
  animate,
  createScope,
  createTimeline,
  stagger,
  steps,
  utils,
} from "animejs";
import clsx from "clsx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const GHOST_MS = 360;
/** Each dither pixel's drop into place. */
const PIXEL_DROP_MS = 320;
const PIXEL_GAP_MS = 45;
const EXIT_MS = 280;
/** After the entrance, how long the splash waits for the session at most. */
const MAX_WAIT_MS = 3_000;
const MEDIA_QUERIES = { reducedMotion: "(prefers-reduced-motion: reduce)" };

const [GHOST, DITHER] = DITHER_BOOTH_MARK.paths;
/** The dither, one square per subpath, so each can fall on its own. */
const PIXELS = DITHER.split(/(?=M)/u);

/**
 * Animation frames stop on a hidden page (a locked phone, a switched app):
 * there, `animation` lands at once instead of waiting to be shown again.
 */
const landWhenHidden = (animation: { complete: () => unknown }) => {
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") animation.complete();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () =>
    document.removeEventListener("visibilitychange", onVisibilityChange);
};

/**
 * The launch screen: the mark on the app icon's background, which the
 * system's own launch screen shows too, while Studio finds its session. The
 * ghost steps in, its dither drops into place pixel by pixel, and once `ready`
 * and the entrance is over, the splash fades and `onDone` unmounts it. It
 * waits for `ready` at most `MAX_WAIT_MS`; the app shows its own loading
 * after that. Reduced motion or a hidden page shows it still.
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
  const [waitedOut, setWaitedOut] = useState(false);
  const leaving = entered && (ready || waitedOut);

  useLayoutEffect(() => {
    let stopLanding = () => {};
    const scope = createScope({ root, mediaQueries: MEDIA_QUERIES }).add(
      (self) => {
        if (
          self?.matches.reducedMotion ||
          document.visibilityState === "hidden"
        ) {
          setEntered(true);
          return;
        }

        // Hidden before the first paint: a pixel would show in place until
        // its delay starts.
        utils.set("[data-splash-ghost], [data-splash-pixel]", { opacity: 0 });
        const entrance = createTimeline({ onComplete: () => setEntered(true) })
          .add("[data-splash-ghost]", {
            opacity: [0, 1],
            translateY: [DITHER_BOOTH_MARK.pixel, 0],
            duration: GHOST_MS,
            ease: steps(3),
          })
          .add(
            "[data-splash-pixel]",
            {
              opacity: [0, 1],
              translateY: [-DITHER_BOOTH_MARK.pixel, 0],
              duration: PIXEL_DROP_MS,
              ease: steps(3),
              delay: stagger(PIXEL_GAP_MS, { from: "random" }),
            },
            `-=${GHOST_MS / 2}`,
          );
        stopLanding = landWhenHidden(entrance);
      },
    );

    return () => {
      stopLanding();
      scope.revert();
    };
  }, []);

  useEffect(() => {
    if (!entered || ready) return;

    const timer = setTimeout(() => setWaitedOut(true), MAX_WAIT_MS);
    return () => clearTimeout(timer);
  }, [entered, ready]);

  useEffect(() => {
    if (!leaving) return;

    let stopLanding = () => {};
    const scope = createScope({ root, mediaQueries: MEDIA_QUERIES }).add(
      (self) => {
        const splash = root.current;
        if (
          !splash ||
          self?.matches.reducedMotion ||
          document.visibilityState === "hidden"
        ) {
          onDone();
          return;
        }

        const exit = animate(splash, {
          opacity: [1, 0],
          duration: EXIT_MS,
          ease: "out(2)",
          onComplete: onDone,
        });
        stopLanding = landWhenHidden(exit);
      },
    );

    return () => {
      stopLanding();
      scope.revert();
    };
  }, [leaving, onDone]);

  return (
    <div
      ref={root}
      role="status"
      style={{ backgroundColor: BRAND_ICON_BACKGROUND }}
      className={clsx(
        "fixed inset-0 z-50 flex items-center justify-center",
        "text-white",
      )}
    >
      <span className={clsx("sr-only")}>Loading Studio</span>
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
