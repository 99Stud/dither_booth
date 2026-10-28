import { animate } from "animejs";
import { useEffect, useRef } from "react";

import type { SystemStatus } from "#lib/system/system.utils";

import {
  SYSTEM_STATUS_PULSE_EASE,
  SYSTEM_STATUS_PULSE_MS,
  SYSTEM_STATUS_PULSE_SCALE,
} from "../System.motion";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/** The returned element swells once when `status` turns to warning or critical. */
export function useStatusPulse<T extends HTMLElement>(
  status: SystemStatus | null,
) {
  const ref = useRef<T>(null);
  const previous = useRef(status);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const was = previous.current;
    const element = ref.current;

    previous.current = status;

    if (
      !element ||
      reduced ||
      was === status ||
      status === null ||
      status === "ok"
    ) {
      return;
    }

    const animation = animate(element, {
      scale: [1, SYSTEM_STATUS_PULSE_SCALE, 1],
      duration: SYSTEM_STATUS_PULSE_MS,
      ease: SYSTEM_STATUS_PULSE_EASE,
    });

    return () => {
      animation.revert();
    };
  }, [status, reduced]);

  return ref;
}
