import { Button } from "@dither-booth/ui/components/ui/button";
import { useIsMobile } from "@dither-booth/ui/hooks/use-mobile";
import { useNavigate, useSearch } from "@tanstack/react-router";
import clsx from "clsx";
import { format } from "date-fns";
import { CircleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { LogFilter, LogService } from "#lib/logs/logs.types";

import { AppSidebarPageHeader } from "#components/Layout/AppSidebar/external/components/AppSidebarPageHeader/index";
import { LOG_FILTER_SERVICES, LOG_LEVELS } from "#lib/logs/logs.constants";
import {
  LOGS_PAGE_PATH,
  getLogFilterFromSearch,
  getLogsSearchFromFilter,
  logsSearchSchema,
} from "#lib/logs/logs.search";

import { LogsConnectionBadge } from "./internal/components/LogsConnectionBadge";
import { LogsEmptyState } from "./internal/components/LogsEmptyState";
import {
  LogsTimeline,
  type LogsTimelineHandle,
} from "./internal/components/LogsTimeline";
import { LogsToolbar } from "./internal/components/LogsToolbar";
import { useLogStream } from "./internal/hooks/useLogStream";
import {
  copyLogText,
  getLogCounts,
  hasActiveLogFilter,
  toNdjson,
  toggleFilterValue,
} from "./internal/Logs.utils";

const isEditableTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * The Logs page: every part of the booth in one live, filterable timeline,
 * full width and height. The filter lives in the URL, so a view is a link.
 */
export const Logs = () => {
  const search = logsSearchSchema.parse(useSearch({ strict: false }));
  const filterKey = JSON.stringify(getLogFilterFromSearch(search));
  const filter = useMemo(() => JSON.parse(filterKey) as LogFilter, [filterKey]);
  const navigate = useNavigate();
  const isPhone = useIsMobile();
  const timelineRef = useRef<LogsTimelineHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [isWrapped, setIsWrapped] = useState(false);
  const stream = useLogStream(filter);
  const counts = useMemo(
    () => getLogCounts(stream.items, filter),
    [stream.items, filter],
  );

  const setFilter = (next: LogFilter) =>
    void navigate({
      to: LOGS_PAGE_PATH,
      search: getLogsSearchFromFilter(next),
      replace: true,
    });

  const withValue = <K extends keyof LogFilter>(
    key: K,
    value: LogFilter[K] | undefined,
  ): LogFilter => {
    const { [key]: _previous, ...rest } = filter;
    return value === undefined ? rest : { ...rest, [key]: value };
  };

  // `/` focuses search; End jumps to the latest line.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;

      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === "End") {
        event.preventDefault();
        timelineRef.current?.jumpToLatest();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const download = () => {
    const blob = new Blob([toNdjson(stream.visibleItems)], {
      type: "application/x-ndjson",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dither-booth-logs-${format(new Date(), "yyyyMMdd-HHmmss")}.ndjson`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  // Browser lines live in the Shutter's and the admin's logs: no source.
  const shownSources = (filter.services ?? LOG_FILTER_SERVICES).flatMap(
    (service): LogService[] => (service === "browser" ? [] : [service]),
  );
  const unavailableSources = shownSources.flatMap((service) => {
    const status = stream.statuses[service];
    return status?.state === "unavailable" ? [{ service, status }] : [];
  });

  const renderList = () => {
    if (!stream.isLoaded) {
      return <LogsEmptyState kind="loading" />;
    }

    if (stream.visibleItems.length > 0) {
      return (
        <LogsTimeline
          ref={timelineRef}
          items={stream.visibleItems}
          firstItemIndex={stream.firstItemIndex}
          appendedCount={stream.appendedCount}
          hasOlder={stream.hasOlder}
          isLoadingOlder={stream.isLoadingOlder}
          isAtLimit={stream.isAtLimit}
          isWrapped={isWrapped}
          search={filter.text}
          onStartReached={stream.loadOlder}
        />
      );
    }

    if (
      shownSources.length > 0 &&
      unavailableSources.length === shownSources.length
    ) {
      return <LogsEmptyState kind="unavailable" sources={unavailableSources} />;
    }

    if (hasActiveLogFilter(filter)) {
      return (
        <LogsEmptyState kind="no-match" onClearFilters={() => setFilter({})} />
      );
    }

    return <LogsEmptyState kind="empty" />;
  };

  const isDisconnected =
    stream.connection === "offline" || stream.connection === "failed";

  return (
    <div
      className={clsx(
        "flex h-svh min-h-0 flex-col md:h-[calc(100svh-1rem)]",
        // Clear of the phone's floating tab bar and home indicator.
        "pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0",
      )}
    >
      <AppSidebarPageHeader title="Logs" />
      <div
        className={clsx(
          "flex items-center justify-between gap-3 px-4 pt-3 pb-1 md:pt-4",
          "max-md:pt-[calc(0.75rem+env(safe-area-inset-top))]",
        )}
      >
        <h1
          className={clsx(
            "text-[2rem] leading-tight font-bold tracking-tight md:text-xl md:font-semibold",
          )}
        >
          Logs
        </h1>
        <LogsConnectionBadge
          connection={stream.connection}
          isPaused={stream.isPaused}
          heldCount={stream.held.length}
        />
      </div>
      {(isDisconnected || stream.error) && (
        <div className={clsx("px-4 pt-2")}>
          <div
            role="alert"
            className={clsx(
              "flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm",
              "dark:bg-destructive/10",
            )}
          >
            <CircleAlert
              aria-hidden
              className={clsx("size-4 shrink-0 text-destructive")}
            />
            <p className={clsx("min-w-0 flex-1")}>
              {stream.connection === "failed"
                ? `The booth refused the logs request${stream.error ? `: ${stream.error}` : "."}`
                : isDisconnected
                  ? "Can't reach the booth's logs. Retrying…"
                  : stream.error}
            </p>
            {isDisconnected && (
              <Button variant="outline" size="sm" onClick={stream.retry}>
                Retry now
              </Button>
            )}
          </div>
        </div>
      )}
      <LogsToolbar
        filter={filter}
        isPhone={isPhone}
        searchRef={searchRef}
        counts={counts}
        statuses={stream.statuses}
        isPaused={stream.isPaused}
        isWrapped={isWrapped}
        hasLines={stream.visibleItems.length > 0}
        onToggleService={(service) =>
          setFilter(
            withValue(
              "services",
              toggleFilterValue(filter.services, LOG_FILTER_SERVICES, service),
            ),
          )
        }
        onToggleLevel={(level) =>
          setFilter(
            withValue(
              "levels",
              toggleFilterValue(filter.levels, LOG_LEVELS, level),
            ),
          )
        }
        onSourceChange={(source) => setFilter(withValue("source", source))}
        onSearchChange={(text) => setFilter(withValue("text", text))}
        onPausedChange={stream.setPaused}
        onWrappedChange={setIsWrapped}
        onCopyLink={() =>
          void copyLogText(window.location.href, "Link copied.")
        }
        onDownload={download}
        onClearFilters={() => setFilter({})}
      />
      <div
        role="log"
        aria-live="off"
        aria-label="Booth logs"
        className={clsx("flex min-h-0 flex-1 flex-col")}
      >
        {renderList()}
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {stream.isPaused && stream.heldErrorCount > 0
          ? `${stream.heldErrorCount} new error${stream.heldErrorCount === 1 ? "" : "s"}`
          : ""}
      </div>
    </div>
  );
};
