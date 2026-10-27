import type { FC } from "react";

import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@dither-booth/ui/components/ui/empty";
import { Skeleton } from "@dither-booth/ui/components/ui/skeleton";
import clsx from "clsx";
import { CircleSlash, FilterX, ScrollText, SearchX } from "lucide-react";

import type { LogService, LogSourceStatus } from "#lib/logs/logs.types";

import { LOG_SERVICE_LABELS } from "../../Logs.constants";

type LogsEmptyStateProps =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "no-match"; onClearFilters: () => void }
  | {
      kind: "unavailable";
      sources: Array<{ service: LogService; status: LogSourceStatus }>;
    };

const SKELETON_WIDTHS = ["w-3/5", "w-2/5", "w-4/5", "w-1/2", "w-3/4", "w-2/3"];

/**
 * What the list shows instead of lines: skeleton rows while the first page
 * loads, "No logs yet", "No lines match" (with Clear filters), or which
 * sources are unavailable and why.
 */
export const LogsEmptyState: FC<LogsEmptyStateProps> = (props) => {
  if (props.kind === "loading") {
    return (
      <div
        aria-busy
        aria-label="Loading logs"
        className={clsx("flex flex-col gap-3 px-3 py-4 md:px-4")}
      >
        {SKELETON_WIDTHS.concat(SKELETON_WIDTHS).map((width, index) => (
          <div key={index} className={clsx("flex items-center gap-3")}>
            <Skeleton className={clsx("h-3.5 w-24 shrink-0")} />
            <Skeleton className={clsx("h-3.5 w-14 shrink-0")} />
            <Skeleton className={clsx("h-3.5", width)} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <Empty className={clsx("h-full")}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {props.kind === "empty" && <ScrollText />}
          {props.kind === "no-match" && <SearchX />}
          {props.kind === "unavailable" && <CircleSlash />}
        </EmptyMedia>
        {props.kind === "empty" && (
          <>
            <EmptyTitle>No logs yet</EmptyTitle>
            <EmptyDescription>
              New lines show here as soon as the booth writes them.
            </EmptyDescription>
          </>
        )}
        {props.kind === "no-match" && (
          <>
            <EmptyTitle>No lines match</EmptyTitle>
            <EmptyDescription>
              The filters hide every line. Clear them to see everything.
            </EmptyDescription>
          </>
        )}
        {props.kind === "unavailable" && (
          <>
            <EmptyTitle>Logs unavailable</EmptyTitle>
            <EmptyDescription>
              The booth can't read the logs of the services shown.
            </EmptyDescription>
          </>
        )}
      </EmptyHeader>
      {props.kind === "no-match" && (
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={props.onClearFilters}>
            <FilterX />
            Clear filters
          </Button>
        </EmptyContent>
      )}
      {props.kind === "unavailable" && (
        <EmptyContent>
          <ul className={clsx("flex flex-col gap-1 text-left text-sm")}>
            {props.sources.map(({ service, status }) => (
              <li key={service}>
                <span className={clsx("font-medium")}>
                  {LOG_SERVICE_LABELS[service]}
                </span>
                <span className={clsx("text-muted-foreground")}>
                  {`: ${status.message}`}
                </span>
              </li>
            ))}
          </ul>
        </EmptyContent>
      )}
    </Empty>
  );
};
