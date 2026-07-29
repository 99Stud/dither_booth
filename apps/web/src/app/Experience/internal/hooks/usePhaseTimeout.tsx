import { useEffect, useRef } from "react";

import type { ExperiencePhase } from "../Experience.machine";

interface UsePhaseTimeoutOptions {
  delayMs: number;
  isActive: boolean;
  onElapsed: () => void;
  phase: ExperiencePhase;
}

/**
 * Runs `onElapsed` once `delayMs` has passed while `isActive` holds.
 *
 * The timer restarts on every phase change, including one between two phases
 * that both keep it active — `isActive` alone would keep a stale timer running
 * across e.g. cameraEntering -> cameraExiting.
 *
 * `onElapsed` is latched in a ref so call sites can pass an inline closure and
 * still observe current state.
 */
export const usePhaseTimeout = ({
  delayMs,
  isActive,
  onElapsed,
  phase,
}: UsePhaseTimeoutOptions) => {
  const onElapsedRef = useRef(onElapsed);

  useEffect(() => {
    onElapsedRef.current = onElapsed;
  });

  useEffect(() => {
    if (!isActive) return;

    const timeoutId = window.setTimeout(() => {
      onElapsedRef.current();
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [delayMs, isActive, phase]);
};
