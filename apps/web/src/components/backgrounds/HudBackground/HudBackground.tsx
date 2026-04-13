import { type FC, useCallback, useEffect, useState } from "react";
import { HudBackgroundCanvas } from "./internal/HudBackgroundCanvas.tsx";

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return reduced;
}

export const HudBackground: FC = () => {
  const reduceMotion = useReducedMotion();
  const [canvasFailed, setCanvasFailed] = useState(false);
  const showCanvas = !reduceMotion && !canvasFailed;
  const showCssBg = reduceMotion || canvasFailed;

  useEffect(() => {
    if (reduceMotion) {
      console.info(
        "[HudBackground] WebGPU canvas skipped — prefers-reduced-motion: reduce (Settings → Accessibility → Motion)",
      );
    }
  }, [reduceMotion]);

  const handleFallback = useCallback(() => {
    setCanvasFailed(true);
  }, []);

  return (
    <>
      {showCanvas && <HudBackgroundCanvas onFallback={handleFallback} />}

      {showCssBg && (
        <div
          aria-hidden
          className="pointer-events-none fixed top-0 left-0 z-0 h-lvh w-lvw max-h-none max-w-none hud-grid-bg hud-splash-grid-animate"
        />
      )}

      <div
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-0 h-lvh w-lvw max-h-none max-w-none hud-cyan-columns hud-splash-cyan-animate"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-0 h-lvh w-lvw max-h-none max-w-none hud-scanlines hud-splash-scan-animate"
      />

      <div
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-0 h-px w-lvw bg-linear-to-r from-transparent via-primary/60 to-transparent hud-splash-rail-animate"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-0 left-0 z-0 h-px w-lvw bg-linear-to-r from-transparent via-primary/40 to-transparent hud-splash-rail-animate"
      />

      <div
        aria-hidden
        className="pointer-events-none fixed top-8 left-6 size-12 border-l-2 border-t-2 border-primary/70 hud-splash-bracket-animate"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed top-8 right-6 size-12 border-r-2 border-t-2 border-primary/70 hud-splash-bracket-animate"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-6 left-6 size-12 border-b-2 border-l-2 border-primary/70 hud-splash-bracket-animate"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed right-6 bottom-6 size-12 border-b-2 border-r-2 border-primary/70 hud-splash-bracket-animate"
      />
    </>
  );
};
