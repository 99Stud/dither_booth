import type { FC, ReactNode } from "react";

import clsx from "clsx";

/** The current value of a slider, next to its label. */
export const ValuePill: FC<{ children: ReactNode }> = ({ children }) => (
  <span
    className={clsx(
      "shrink-0 rounded-md bg-muted px-2 py-0.5 text-sm font-semibold tabular-nums",
    )}
  >
    {children}
  </span>
);
