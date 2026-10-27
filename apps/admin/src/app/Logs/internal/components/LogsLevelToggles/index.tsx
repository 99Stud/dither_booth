import type { FC } from "react";

import { Toggle } from "@dither-booth/ui/components/ui/toggle";
import clsx from "clsx";

import type { LogLevel } from "#lib/logs/logs.types";

import { LOG_LEVELS } from "#lib/logs/logs.constants";

import { LogLevelLabel } from "../LogLevelLabel";

interface LogsLevelTogglesProps {
  /** The levels shown; `undefined` shows them all. */
  selected?: LogLevel[];
  counts: Record<LogLevel, number>;
  onToggle: (level: LogLevel) => void;
}

/**
 * Error, Warn and Info: each on or off, with how many lines it has while
 * it shows. A hidden level's lines aren't loaded, so it gets no number.
 */
export const LogsLevelToggles: FC<LogsLevelTogglesProps> = ({
  selected,
  counts,
  onToggle,
}) => (
  <div
    role="group"
    aria-label="Levels"
    className={clsx("flex shrink-0 items-center gap-1")}
  >
    {LOG_LEVELS.map((level) => {
      const isPressed = !selected || selected.includes(level);

      return (
      <Toggle
        key={level}
        variant="outline"
        size="sm"
        pressed={isPressed}
        onPressedChange={() => onToggle(level)}
        className={clsx(
          "gap-1.5",
          "aria-pressed:border-foreground/25 aria-pressed:bg-muted",
          "not-aria-pressed:opacity-60",
        )}
      >
        <LogLevelLabel level={level} />
        {isPressed && (
          <span className={clsx("text-muted-foreground tabular-nums")}>
            {counts[level]}
          </span>
        )}
      </Toggle>
      );
    })}
  </div>
);
