import type { FC } from "react";

import { Badge } from "@dither-booth/ui/components/ui/badge";
import clsx from "clsx";
import { LoaderCircle, Pause, WifiOff } from "lucide-react";

import type { LogsConnectionState } from "../../Logs.types";

interface LogsConnectionBadgeProps {
  connection: LogsConnectionState;
  isPaused: boolean;
  /** Lines held while paused. */
  heldCount: number;
}

/**
 * Whether the page shows current logs: Live, Paused, Reconnecting or
 * Offline (Connecting at first). An icon and a word, never colour alone.
 */
export const LogsConnectionBadge: FC<LogsConnectionBadgeProps> = ({
  connection,
  isPaused,
  heldCount,
}) => {
  const isConnected = connection === "live";
  const label =
    isConnected && isPaused
      ? heldCount > 0
        ? `Paused · ${heldCount} new`
        : "Paused"
      : {
          connecting: "Connecting",
          live: "Live",
          reconnecting: "Reconnecting",
          offline: "Offline",
          failed: "Offline",
        }[connection];

  return (
    <Badge
      role="status"
      aria-label={`Connection: ${label}`}
      variant="outline"
      className={clsx(
        "h-6 gap-1.5 px-2.5 tabular-nums",
        (connection === "offline" || connection === "failed") &&
          "border-destructive/40 text-destructive",
        connection === "reconnecting" && "border-warning/50 text-warning",
      )}
    >
      {isConnected && !isPaused && (
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
      {isConnected && isPaused && <Pause aria-hidden />}
      {(connection === "connecting" || connection === "reconnecting") && (
        <LoaderCircle
          aria-hidden
          className={clsx("animate-spin motion-reduce:animate-none")}
        />
      )}
      {(connection === "offline" || connection === "failed") && (
        <WifiOff aria-hidden />
      )}
      {label}
    </Badge>
  );
};
