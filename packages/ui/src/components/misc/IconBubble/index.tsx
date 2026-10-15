import type { FC, ReactNode } from "react";

import { cn } from "#lib/utils";

/**
 * Soft colour families, one per area of the product, so sections are
 * recognisable at a glance (Lottery is always violet, Prizes amber, …).
 */
const TONES = {
  brand: "bg-brand/15 text-brand dark:bg-brand/15",
  violet:
    "bg-violet-500/12 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300",
  amber:
    "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  emerald:
    "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  sky: "bg-sky-500/12 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
  rose: "bg-rose-500/12 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300",
  zinc: "bg-muted text-muted-foreground",
} as const;

export type IconBubbleTone = keyof typeof TONES;

/**
 * An icon in a tinted rounded square: the icon at full strength, its
 * container at low opacity. The friendly, colour-coded marker used on
 * section titles and stats.
 */
export const IconBubble: FC<{
  tone?: IconBubbleTone;
  size?: "sm" | "md";
  className?: string;
  children: ReactNode;
}> = ({ tone = "brand", size = "sm", className, children }) => (
  <span
    aria-hidden
    className={cn(
      "inline-flex shrink-0 items-center justify-center",
      size === "sm"
        ? "size-7 rounded-lg [&_svg]:size-4"
        : "size-10 rounded-xl [&_svg]:size-5",
      TONES[tone],
      className,
    )}
  >
    {children}
  </span>
);
