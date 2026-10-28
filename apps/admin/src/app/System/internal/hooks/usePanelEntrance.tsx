import { animate, stagger } from "animejs";
import { useLayoutEffect, useRef } from "react";

import {
  SYSTEM_PANEL_ATTRIBUTE,
  SYSTEM_PANEL_ENTRANCE_EASE,
  SYSTEM_PANEL_ENTRANCE_MS,
  SYSTEM_PANEL_RISE_PX,
  SYSTEM_PANEL_STAGGER_MS,
} from "../System.motion";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/**
 * Once `ready`, the panels inside the returned element fade in and rise,
 * one after the other. Only once: a refetch never replays it. A hidden
 * page gets no entrance: animation frames don't run there, and the panels
 * would wait at their first, invisible frame until the tab is shown.
 */
export function usePanelEntrance<T extends HTMLElement>(ready: boolean) {
  const ref = useRef<T>(null);
  const played = useRef(false);
  const reduced = usePrefersReducedMotion();

  useLayoutEffect(() => {
    const container = ref.current;

    if (!ready || played.current || !container) {
      return;
    }

    played.current = true;

    if (reduced || document.visibilityState === "hidden") {
      return;
    }

    const animation = animate(
      container.querySelectorAll(`[${SYSTEM_PANEL_ATTRIBUTE}]`),
      {
        opacity: [0, 1],
        translateY: [SYSTEM_PANEL_RISE_PX, 0],
        duration: SYSTEM_PANEL_ENTRANCE_MS,
        ease: SYSTEM_PANEL_ENTRANCE_EASE,
        delay: stagger(SYSTEM_PANEL_STAGGER_MS),
      },
    );

    // Hidden mid-way (a locked phone, a switched tab): land the panels now.
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        animation.complete();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      animation.revert();
    };
  }, [ready, reduced]);

  return ref;
}
