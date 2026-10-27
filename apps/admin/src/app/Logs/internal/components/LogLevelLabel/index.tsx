import type { FC } from "react";

import clsx from "clsx";
import { CircleX, Info, TriangleAlert } from "lucide-react";

import type { LogLevel } from "#lib/logs/logs.types";

import { LOG_LEVEL_LABELS } from "../../Logs.constants";

const LEVEL_ICONS = {
  error: CircleX,
  warn: TriangleAlert,
  info: Info,
} as const;

/** A level as an icon and a word, never colour alone. */
export const LogLevelLabel: FC<{ level: LogLevel; className?: string }> = ({
  level,
  className,
}) => {
  const Icon = LEVEL_ICONS[level];

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 font-medium",
        level === "error" && "text-destructive",
        level === "warn" && "text-warning",
        level === "info" && "text-muted-foreground",
        className,
      )}
    >
      <Icon aria-hidden className={clsx("size-3.5 shrink-0")} />
      {LOG_LEVEL_LABELS[level]}
    </span>
  );
};
