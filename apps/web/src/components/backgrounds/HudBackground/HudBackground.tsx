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

      <div
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-0 h-px w-lvw bg-linear-to-r from-transparent via-primary/60 to-transparent hud-splash-rail-animate"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-0 left-0 z-0 h-px w-lvw bg-linear-to-r from-transparent via-primary/40 to-transparent hud-splash-rail-animate"
      />
    </>
  );
};
