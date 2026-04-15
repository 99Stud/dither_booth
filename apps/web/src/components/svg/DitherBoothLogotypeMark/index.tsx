import type { FC } from "react";

import { cn } from "#lib/utils.ts";

export const DitherBoothLogotypeMark: FC<{ className?: string }> = (props) => {
  const { className } = props;
  return (
    <svg
      className={cn("h-auto w-auto shrink-0", className)}
      viewBox="0 0 411 703"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <g fill="currentColor">
        <path d="M352.054 58.6844V0H58.6757V58.6844H0V293.422H58.6757V234.738H117.351V293.422H176.027V352.106H234.703V293.422H293.378V234.738H352.054V293.422H410.73V58.6844H352.054ZM176.027 234.738V176.053H234.703V234.738H176.027Z" />
        <path d="M117.351 293.422H58.6757V352.106H117.351V293.422Z" />
        <path d="M352.054 293.422H293.378V352.106H352.054V293.422Z" />
        <path d="M58.6757 352.106H0V410.791H58.6757V352.106Z" />
        <path d="M117.351 410.791H58.6757V469.475H117.351V410.791Z" />
        <path d="M176.027 352.106H117.351V410.791H176.027V352.106Z" />
        <path d="M234.703 410.791H176.027V469.475H234.703V410.791Z" />
        <path d="M234.703 528.159H176.027V586.844H234.703V528.159Z" />
        <path d="M293.378 352.106H234.703V410.791H293.378V352.106Z" />
        <path d="M176.027 643.768H117.351V702.452H176.027V643.768Z" />
        <path d="M293.378 643.768H234.703V702.452H293.378V643.768Z" />
        <path d="M352.054 410.791H293.378V469.475H352.054V410.791Z" />
        <path d="M410.73 352.106H352.054V410.791H410.73V352.106Z" />
        <path d="M58.6757 528.159H0V586.844H58.6757V528.159Z" />
        <path d="M410.73 528.159H352.054V586.844H410.73V528.159Z" />
      </g>
    </svg>
  );
};
