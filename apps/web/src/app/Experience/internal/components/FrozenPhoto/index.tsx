import type { FC } from "react";

import { animate, createScope, utils } from "animejs";
import clsx from "clsx";
import { useLayoutEffect, useRef } from "react";

import { FROZEN_PHOTO_SCALE } from "../../Experience.constants";
import { SLOT_STAGE_ENTER_MS } from "../../Experience.motion";
import {
  splitTileClassName,
  splitTileEdgeOffset,
} from "../../Experience.styles";

/**
 * The captured square. It starts covering the webcam box, then shrinks to the
 * shared tile size and slides to the left half of the pair. The outer div owns
 * the final layout; anime.js only transforms the inner frame.
 */
export const FrozenPhoto: FC<{
  isVisible: boolean;
  photoUrl: string | null;
  tilePx: number;
}> = (props) => {
  const { isVisible, photoUrl, tilePx } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!isVisible || photoUrl === null) return;

    const root = rootRef.current;
    const frame = frameRef.current;
    const stage = root?.parentElement;

    if (!root || !frame || !stage || tilePx === 0) return;

    const scope = createScope({ root }).add(() => {
      const startX =
        stage.clientWidth / 2 - (root.offsetLeft + root.clientWidth / 2);

      utils.set(frame, {
        translateX: startX,
        scale: 1 / FROZEN_PHOTO_SCALE,
      });

      animate(frame, {
        translateX: 0,
        scale: 1,
        duration: SLOT_STAGE_ENTER_MS,
        ease: "outQuart",
      });
    });

    return () => scope.revert();
  }, [isVisible, photoUrl, tilePx]);

  if (!isVisible || photoUrl === null) return null;

  return (
    <div
      ref={rootRef}
      style={{ left: splitTileEdgeOffset }}
      className={clsx("z-10", splitTileClassName)}
    >
      <div ref={frameRef} className="h-full w-full">
        <img
          src={photoUrl}
          alt=""
          draggable={false}
          className={clsx("h-full w-full max-w-none", "shadow-soft")}
        />
      </div>
    </div>
  );
};
