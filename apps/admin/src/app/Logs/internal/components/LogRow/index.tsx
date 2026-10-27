import type { FC } from "react";

import clsx from "clsx";
import { ChevronRight } from "lucide-react";

import type { LogEntry } from "#lib/logs/logs.types";

import {
  formatLogTime,
  getLogPreview,
  getLogServiceLabel,
} from "../../Logs.utils";
import { LogDetails } from "../LogDetails";
import { LogLevelLabel } from "../LogLevelLabel";
import { LogsHighlight } from "../LogsHighlight";

interface LogRowProps {
  entry: LogEntry;
  /** Shows the details under the line. */
  isExpanded: boolean;
  /** Long lines wrap instead of being cut. */
  isWrapped: boolean;
  /** The search text, marked wherever it appears. */
  search?: string;
  /** Click or Enter on the line. */
  onActivate: () => void;
}

/**
 * One log line: time to the millisecond, service, level, source, event and
 * a preview of its details. Desktop: one row of columns. Phone: two lines.
 * Error lines are tinted.
 */
export const LogRow: FC<LogRowProps> = ({
  entry,
  isExpanded,
  isWrapped,
  search,
  onActivate,
}) => {
  const preview = getLogPreview(entry);
  const textClassName = isWrapped
    ? "break-all whitespace-pre-wrap"
    : "truncate";

  return (
    <div
      data-level={entry.level}
      className={clsx(
        "border-b border-border/60",
        entry.level === "error" && "bg-destructive/5 dark:bg-destructive/10",
      )}
    >
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={onActivate}
        className={clsx(
          "group/row w-full px-3 py-1.5 text-left font-mono text-xs md:px-4",
          "flex flex-col gap-0.5",
          "md:grid md:grid-cols-[1rem_6.5rem_4.5rem_3.75rem_minmax(0,11rem)_minmax(0,1fr)] md:items-baseline md:gap-3",
          "transition-colors outline-none hover:bg-muted/60",
          "focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
          isExpanded && "bg-muted/60",
        )}
      >
        <ChevronRight
          aria-hidden
          className={clsx(
            "hidden size-3.5 self-center text-muted-foreground transition-transform md:block",
            isExpanded && "rotate-90",
          )}
        />
        <span className={clsx("flex items-center gap-2 md:contents")}>
          <time
            dateTime={entry.timestamp}
            className={clsx("shrink-0 text-muted-foreground tabular-nums")}
          >
            {formatLogTime(entry.timestamp)}
          </time>
          <span className={clsx("shrink-0 truncate font-sans font-medium")}>
            {getLogServiceLabel(entry)}
          </span>
          <LogLevelLabel
            level={entry.level}
            className={clsx("shrink-0 font-sans")}
          />
          {entry.source && (
            <span
              className={clsx(
                "min-w-0 truncate text-muted-foreground max-md:ml-auto",
              )}
            >
              <LogsHighlight text={entry.source} search={search} />
            </span>
          )}
        </span>
        <span className={clsx("min-w-0 md:col-start-6", textClassName)}>
          {entry.event ? (
            <>
              <span className={clsx("font-medium text-foreground")}>
                <LogsHighlight text={entry.event} search={search} />
              </span>
              {preview && (
                <span className={clsx("ml-2 text-muted-foreground")}>
                  <LogsHighlight text={preview} search={search} />
                </span>
              )}
            </>
          ) : (
            <LogsHighlight text={preview} search={search} />
          )}
        </span>
      </button>
      {isExpanded && (
        <div className={clsx("px-3 pt-2 pb-4 md:pr-4 md:pl-11")}>
          <LogDetails entry={entry} />
        </div>
      )}
    </div>
  );
};
