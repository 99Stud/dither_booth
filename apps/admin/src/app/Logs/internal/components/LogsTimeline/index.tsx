import type { FC, Ref } from "react";

import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@dither-booth/ui/components/ui/sheet";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import { useIsMobile } from "@dither-booth/ui/hooks/use-mobile";
import clsx from "clsx";
import { ArrowDown, RotateCw, Unplug, Archive } from "lucide-react";
import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";

import type { LogEntry } from "#lib/logs/logs.types";

import { isRestartEntry } from "#lib/logs/logs.utils";

import type { LogsTimelineItem } from "../../Logs.types";

import {
  LOGS_LEFT_BOTTOM_GRACE_MS,
  LOGS_PAGE_MAX_ENTRIES,
  LOG_SERVICE_LABELS,
} from "../../Logs.constants";
import {
  formatLogDividerTime,
  formatLogTime,
  getLogServiceLabel,
} from "../../Logs.utils";
import { LogDetails } from "../LogDetails";
import { LogRow } from "../LogRow";
import { LogsDivider } from "../LogsDivider";

/** What the page can ask of the list. */
export type LogsTimelineHandle = {
  /** Scrolls to the latest line, and follows again. */
  jumpToLatest: () => void;
};

interface LogsTimelineProps {
  ref?: Ref<LogsTimelineHandle>;
  items: LogsTimelineItem[];
  firstItemIndex: number;
  /** Rows added at the end so far, for the new-lines pill. */
  appendedCount: number;
  hasOlder: boolean;
  isLoadingOlder: boolean;
  isAtLimit: boolean;
  isWrapped: boolean;
  search?: string;
  onStartReached: () => void;
}

const formatCount = (count: number) => count.toLocaleString("en-GB");

const TimelineHeader: FC<{
  hasOlder: boolean;
  isLoadingOlder: boolean;
  isAtLimit: boolean;
}> = ({ hasOlder, isLoadingOlder, isAtLimit }) => (
  <div
    className={clsx(
      "flex min-h-8 items-center justify-center gap-2 px-4 py-2 text-xs text-muted-foreground",
    )}
  >
    {isLoadingOlder ? (
      <>
        <Spinner className={clsx("size-3.5")} />
        Loading older lines…
      </>
    ) : isAtLimit ? (
      `Showing at most ${formatCount(LOGS_PAGE_MAX_ENTRIES)} lines. Narrow the filters to read further back.`
    ) : hasOlder ? null : (
      "Start of the log"
    )}
  </div>
);

const RECONNECT_LABELS = {
  pending: "Connection lost · reconnecting",
  complete: "Reconnected · no lines missed",
  gap: "Reconnected · some lines may be missing",
} as const;

/**
 * The merged timeline: a virtual list that follows new lines while at the
 * bottom, stops when scrolled up (with a "Jump to latest" pill), loads
 * older lines at the top without moving, and expands a line in place, or
 * in a sheet on phones.
 */
export const LogsTimeline: FC<LogsTimelineProps> = ({
  ref,
  items,
  firstItemIndex,
  appendedCount,
  hasOlder,
  isLoadingOlder,
  isAtLimit,
  isWrapped,
  search,
  onStartReached,
}) => {
  const isPhone = useIsMobile();
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [expandedId, setExpandedId] = useState<string>();
  const [sheetEntry, setSheetEntry] = useState<LogEntry>();
  /** `appendedCount` when the reader scrolled away from the bottom. */
  const [leftBottomAt, setLeftBottomAt] = useState<number>();
  const appendedCountRef = useRef(appendedCount);
  appendedCountRef.current = appendedCount;
  const expandedIdRef = useRef(expandedId);
  expandedIdRef.current = expandedId;
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(leaveTimerRef.current), []);

  const newLineCount =
    leftBottomAt === undefined ? 0 : Math.max(0, appendedCount - leftBottomAt);

  // New lines leave the bottom for a moment before the list follows them:
  // only a stay away from it counts as the reader scrolling up.
  const onAtBottomChange = (isAtBottom: boolean) => {
    clearTimeout(leaveTimerRef.current);

    if (isAtBottom) {
      setLeftBottomAt(undefined);
      return;
    }

    const countWhenLeft = appendedCountRef.current;
    leaveTimerRef.current = setTimeout(
      () => setLeftBottomAt(countWhenLeft),
      LOGS_LEFT_BOTTOM_GRACE_MS,
    );
  };

  const jumpToLatest = () => {
    clearTimeout(leaveTimerRef.current);
    setExpandedId(undefined);
    virtuosoRef.current?.scrollToIndex({ index: "LAST", align: "end" });
    setLeftBottomAt(undefined);
  };

  useImperativeHandle(ref, () => ({ jumpToLatest }));

  const header = useMemo(
    () => () => (
      <TimelineHeader
        hasOlder={hasOlder}
        isLoadingOlder={isLoadingOlder}
        isAtLimit={isAtLimit}
      />
    ),
    [hasOlder, isLoadingOlder, isAtLimit],
  );

  const renderItem = (item: LogsTimelineItem) => {
    switch (item.kind) {
      case "rotated":
        return (
          <LogsDivider icon={<Archive />}>
            {`${LOG_SERVICE_LABELS[item.service]} log rotated · ${formatLogDividerTime(item.timestamp)}`}
          </LogsDivider>
        );
      case "reconnect":
        return (
          <LogsDivider icon={<Unplug />} isWarning={item.state !== "complete"}>
            {`${RECONNECT_LABELS[item.state]} · ${formatLogDividerTime(item.timestamp)}`}
          </LogsDivider>
        );
      case "entry":
        if (isRestartEntry(item.entry)) {
          return (
            <LogsDivider icon={<RotateCw />}>
              {`${getLogServiceLabel(item.entry)} restarted · ${formatLogDividerTime(item.entry.timestamp)}`}
            </LogsDivider>
          );
        }

        return (
          <LogRow
            entry={item.entry}
            isExpanded={!isPhone && expandedId === item.id}
            isWrapped={isWrapped}
            search={search}
            onActivate={() => {
              if (isPhone) {
                setSheetEntry(item.entry);
                return;
              }
              setExpandedId((current) =>
                current === item.id ? undefined : item.id,
              );
            }}
          />
        );
    }
  };

  return (
    <div className={clsx("relative min-h-0 flex-1")}>
      <Virtuoso
        ref={virtuosoRef}
        className={clsx("h-full")}
        data={items}
        firstItemIndex={firstItemIndex}
        initialTopMostItemIndex={{ index: "LAST", align: "end" }}
        computeItemKey={(_, item) => item.id}
        // An open line holds still while it's read.
        followOutput={(isAtBottom) =>
          isAtBottom && !expandedIdRef.current ? "auto" : false
        }
        atBottomThreshold={48}
        atBottomStateChange={onAtBottomChange}
        startReached={onStartReached}
        increaseViewportBy={400}
        components={{ Header: header }}
        itemContent={(_, item) => renderItem(item)}
      />
      {newLineCount > 0 && (
        <div
          className={clsx(
            "pointer-events-none absolute inset-x-0 bottom-4 flex justify-center",
          )}
        >
          <Button
            size="sm"
            className={clsx("pointer-events-auto rounded-full shadow-lg")}
            onClick={jumpToLatest}
          >
            <ArrowDown />
            {`${formatCount(newLineCount)} new line${newLineCount === 1 ? "" : "s"} · Jump to latest`}
          </Button>
        </div>
      )}
      <Sheet
        open={sheetEntry !== undefined}
        onOpenChange={(open) => {
          if (!open) setSheetEntry(undefined);
        }}
      >
        <SheetContent
          side="bottom"
          className={clsx("max-h-[85svh] gap-0 rounded-t-2xl")}
        >
          {sheetEntry && (
            <>
              <SheetHeader>
                <SheetTitle className={clsx("font-mono text-sm break-all")}>
                  {sheetEntry.event ?? "Log line"}
                </SheetTitle>
                <SheetDescription>
                  {`${getLogServiceLabel(sheetEntry)} · ${formatLogTime(sheetEntry.timestamp)}`}
                </SheetDescription>
              </SheetHeader>
              <div
                className={clsx(
                  "overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
                )}
              >
                <LogDetails entry={sheetEntry} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};
