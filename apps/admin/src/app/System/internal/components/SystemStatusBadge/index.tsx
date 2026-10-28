import type { FC } from "react";

import { Badge } from "@dither-booth/ui/components/ui/badge";
import clsx from "clsx";
import { TriangleAlert, WifiOff } from "lucide-react";

export type SystemConnectionState = "live" | "stale" | "offline";

const LABELS: Record<SystemConnectionState, string> = {
  live: "Live",
  stale: "Not updating",
  offline: "Offline",
};

/**
 * Whether the numbers are current: Live, Not updating (the admin server
 * answers but its last read is old) or Offline (it doesn't answer, the
 * last reading stays). An icon and a word, never colour alone.
 */
export const SystemStatusBadge: FC<{ state: SystemConnectionState }> = ({
  state,
}) => (
  <Badge
    role="status"
    aria-label={`Readings: ${LABELS[state]}`}
    variant="outline"
    className={clsx(
      "h-6 gap-1.5 px-2.5",
      state === "stale" && "border-warning/50 text-warning",
      state === "offline" && "border-destructive/40 text-destructive",
    )}
  >
    {state === "live" && (
      <span
        aria-hidden
        className={clsx("relative flex size-2 items-center justify-center")}
      >
        <span
          className={clsx(
            "absolute size-2 animate-ping rounded-full bg-success/60 motion-reduce:animate-none",
          )}
        />
        <span className={clsx("size-1.5 rounded-full bg-success")} />
      </span>
    )}
    {state === "stale" && <TriangleAlert aria-hidden />}
    {state === "offline" && <WifiOff aria-hidden />}
    {LABELS[state]}
  </Badge>
);
