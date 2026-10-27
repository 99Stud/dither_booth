import type { FC, ReactNode } from "react";

import clsx from "clsx";

interface LogsDividerProps {
  icon: ReactNode;
  /** Draws the divider as a warning: lines may be missing. */
  isWarning?: boolean;
  children: ReactNode;
}

/**
 * A line across the timeline that marks a moment rather than a log line: a
 * server restart, a rotated log, a reconnect.
 */
export const LogsDivider: FC<LogsDividerProps> = ({
  icon,
  isWarning = false,
  children,
}) => (
  <div
    role="separator"
    aria-label={typeof children === "string" ? children : undefined}
    className={clsx(
      "flex items-center gap-3 px-3 py-2 text-xs font-medium md:px-4",
      isWarning ? "text-warning" : "text-muted-foreground",
      "before:h-px before:flex-1 before:bg-border",
      "after:h-px after:flex-1 after:bg-border",
    )}
  >
    <span
      className={clsx("flex shrink-0 items-center gap-1.5 [&_svg]:size-3.5")}
    >
      {icon}
      {children}
    </span>
  </div>
);
