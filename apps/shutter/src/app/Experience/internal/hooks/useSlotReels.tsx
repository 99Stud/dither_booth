import type { JSAnimation } from "animejs";
import type { RefObject } from "react";

import { animate, createScope, steps, utils } from "animejs";
import { useEffect, useRef } from "react";

import type { ReelFaces } from "../slot-machine.utils";

import { REEL_CELL_HEIGHT_PX } from "../Experience.constants";
import {
  REEL_SPIN_TICK_MS,
  REEL_STOP_DURATION_MS,
  REEL_STOP_EXTRA_CYCLES,
  REEL_STOP_STAGGER_MS,
  SLOT_STAGE_ENTER_MS,
} from "../Experience.motion";
import { REEL_COUNT, REEL_STRIP } from "../slot-machine.utils";

const CYCLE_HEIGHT_PX = REEL_CELL_HEIGHT_PX * REEL_STRIP.length;

/**
 * Spins the reel strips the moment the panel mounts and, once the faces are
 * known, lands them one after another. The loops live in a ref rather than in
 * the stopping effect's closure so the arrival of the draw does not restart
 * them: a restart would snap every strip back to its first icon.
 */
export const useSlotReels = ({
  faces,
  isActive,
  onReelsStopped,
  rootRef,
  stripRefs,
}: {
  faces: ReelFaces | null;
  isActive: boolean;
  onReelsStopped: () => void;
  rootRef: RefObject<HTMLDivElement | null>;
  stripRefs: RefObject<(HTMLDivElement | null)[]>;
}) => {
  const loopsRef = useRef<JSAnimation[]>([]);
  const onReelsStoppedRef = useRef(onReelsStopped);

  useEffect(() => {
    onReelsStoppedRef.current = onReelsStopped;
  }, [onReelsStopped]);

  useEffect(() => {
    if (!isActive) return;

    const root = rootRef.current;
    const strips = stripRefs.current.filter(
      (strip): strip is HTMLDivElement => strip !== null,
    );

    if (!root || strips.length !== REEL_COUNT) return;

    const scope = createScope({ root }).add(() => {
      loopsRef.current = strips.map((strip, index) => {
        // Offset each strip by one face so the three never tick in unison.
        const start = -index * REEL_CELL_HEIGHT_PX;

        return animate(strip, {
          translateY: [start, start - CYCLE_HEIGHT_PX],
          duration: REEL_SPIN_TICK_MS * REEL_STRIP.length,
          ease: steps(REEL_STRIP.length, false),
          loop: true,
        });
      });
    });

    return () => {
      loopsRef.current = [];
      scope.revert();
    };
  }, [isActive, rootRef, stripRefs]);

  useEffect(() => {
    if (!isActive || faces === null) return;

    const strips = stripRefs.current.filter(
      (strip): strip is HTMLDivElement => strip !== null,
    );

    if (strips.length !== REEL_COUNT) return;

    const stops: JSAnimation[] = [];
    const timeoutIds = strips.map((strip, index) =>
      window.setTimeout(
        () => {
          loopsRef.current[index]?.pause();

          // Re-anchor inside the first revolution so the deceleration always
          // travels the same distance whatever the loop was showing.
          const current = utils.get(strip, "translateY", false);
          const anchored = -(Math.abs(current) % CYCLE_HEIGHT_PX);
          const face = faces[index] ?? faces[0];
          const faceIndex = Math.max(0, REEL_STRIP.indexOf(face));
          const target = -(
            REEL_STOP_EXTRA_CYCLES * CYCLE_HEIGHT_PX +
            faceIndex * REEL_CELL_HEIGHT_PX
          );

          utils.set(strip, { translateY: anchored });

          const stop = animate(strip, {
            translateY: target,
            duration: REEL_STOP_DURATION_MS,
            ease: "outCubic",
          });

          if (index === REEL_COUNT - 1) {
            void stop.then(() => onReelsStoppedRef.current());
          }

          stops.push(stop);
        },
        SLOT_STAGE_ENTER_MS + index * REEL_STOP_STAGGER_MS,
      ),
    );

    return () => {
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
      stops.forEach((stop) => stop.revert());
    };
  }, [faces, isActive, stripRefs]);
};
