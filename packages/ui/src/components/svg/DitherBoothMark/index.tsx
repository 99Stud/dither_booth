import type { FC } from "react";

import { DITHER_BOOTH_MARK } from "#lib/brand";
import { cn } from "#lib/utils";

interface DitherBoothMarkProps {
  className?: string;
}

/** The Dither Booth mark, in the current text colour. */
export const DitherBoothMark: FC<DitherBoothMarkProps> = ({ className }) => (
  <svg
    aria-hidden
    className={cn("h-auto w-auto", className)}
    xmlns="http://www.w3.org/2000/svg"
    viewBox={`0 0 ${DITHER_BOOTH_MARK.width} ${DITHER_BOOTH_MARK.height}`}
  >
    {DITHER_BOOTH_MARK.paths.map((d) => (
      <path key={d} fill="currentColor" d={d} />
    ))}
  </svg>
);
