import clsx from "clsx";

import { SPLIT_TILE_GAP_PX } from "./Experience.constants";

/** Shared square for the frozen photo and the slot panel. Width comes from `--split-tile`. */
export const splitTileClassName = clsx(
  "absolute top-1/2 aspect-square w-[var(--split-tile)] -translate-y-1/2",
);

export const splitTileEdgeOffset = `calc((100% - 2 * var(--split-tile) - ${SPLIT_TILE_GAP_PX}px) / 2)`;

/** White frame flush with the picture. Live feed fades it in; the frozen tile does not. */
export const cameraFrameClassName = clsx(
  "pointer-events-none absolute inset-0 border-[6px] border-white/90",
  "drop-shadow-glow",
);

export const experienceStageClassName = clsx(
  "pointer-events-none fixed inset-0 z-[15]",
  "font-bit text-white/90 text-shadow-glow",
);
