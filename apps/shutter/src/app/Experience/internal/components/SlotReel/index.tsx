import type { Rarity } from "@dither-booth/shared/lottery";
import type { FC, Ref } from "react";

import clsx from "clsx";

import {
  REEL_CELL_HEIGHT_PX,
  REEL_CELL_WIDTH_PX,
} from "../../Experience.constants";
import { REEL_STOP_EXTRA_CYCLES } from "../../Experience.motion";
import { getRarityReveal } from "../../lottery-reveal.utils";
import { REEL_STRIP } from "../../slot-machine.utils";

/**
 * Enough repeats for the deceleration to travel REEL_STOP_EXTRA_CYCLES full
 * strips and still have a face below the last target when it lands.
 */
const STRIP_REPEATS = REEL_STOP_EXTRA_CYCLES + 2;

const STRIP_FACES: readonly Rarity[] = Array.from(
  { length: STRIP_REPEATS },
  () => REEL_STRIP,
).flat();

export const SlotReel: FC<{
  isHighlighted: boolean;
  stripRef: Ref<HTMLDivElement>;
}> = (props) => {
  const { isHighlighted, stripRef } = props;

  return (
    <div
      className="relative overflow-hidden"
      style={{ height: REEL_CELL_HEIGHT_PX, width: REEL_CELL_WIDTH_PX }}
    >
      <div ref={stripRef} className="will-change-transform">
        {STRIP_FACES.map((rarity, index) => {
          const { Icon } = getRarityReveal(rarity);

          return (
            <div
              key={index}
              className="flex items-center justify-center"
              style={{ height: REEL_CELL_HEIGHT_PX }}
            >
              <Icon
                className={clsx(
                  "size-20 drop-shadow-glow",
                  isHighlighted && "animate-flashing",
                )}
                aria-hidden
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
