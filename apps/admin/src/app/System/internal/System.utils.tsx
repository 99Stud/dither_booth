import type { SystemStatus } from "#lib/system/system.utils";

/** Colours a shadcn Progress's bar by status; the word beside it says the same. */
export const progressToneClassName = (status: SystemStatus | null) =>
  status === "critical"
    ? "[&_[data-slot=progress-indicator]]:bg-destructive"
    : status === "warning"
      ? "[&_[data-slot=progress-indicator]]:bg-warning"
      : undefined;
