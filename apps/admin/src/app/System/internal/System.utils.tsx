import type { SystemStatus } from "#lib/system/system.utils";

/** Colours a shadcn Progress's bar by status; the word beside it says the same. */
export const progressToneClassName = (status: SystemStatus | null) =>
  status === "critical"
    ? "[&_[data-slot=progress-indicator]]:bg-destructive"
    : status === "warning"
      ? "[&_[data-slot=progress-indicator]]:bg-warning"
      : undefined;

/**
 * Tints an outline Badge by status. A warning keeps foreground text: amber
 * text fails contrast on the light card, so only the icon and edges are.
 */
export const badgeToneClassName = (status: SystemStatus | null) =>
  status === "critical"
    ? "border-destructive/40 text-destructive"
    : status === "warning"
      ? "border-warning/60 bg-warning/10 [&>svg]:text-warning"
      : undefined;
