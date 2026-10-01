import clsx from "clsx";

import { SPLIT_TILE_GAP_PX } from "./Experience.constants";

export const kioskButtonClassName = clsx(
  "h-18 px-6",
  "cursor-pointer border border-white/50 bg-primary/60 backdrop-blur-sm",
  "shadow-glow",
);

export const kioskButtonLabelClassName = clsx(
  "text-5xl leading-none font-bold uppercase",
);

/** Shared square for the frozen photo and the slot panel. Width comes from `--split-tile`. */
export const splitTileClassName = clsx(
  "absolute top-1/2 aspect-square w-[var(--split-tile)] -translate-y-1/2",
);

export const splitTileEdgeOffset = `calc((100% - 2 * var(--split-tile) - ${SPLIT_TILE_GAP_PX}px) / 2)`;

export const experienceStageClassName = clsx(
  "pointer-events-none fixed inset-0",
  "font-bit text-white/90 text-shadow-glow",
);
