import type { FC, Ref } from "react";

import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@dither-booth/ui/components/ui/sheet";
import { Toggle } from "@dither-booth/ui/components/ui/toggle";
import clsx from "clsx";
import { Pause, Play, SlidersHorizontal, WrapText } from "lucide-react";
import { useState } from "react";

import type {
  LogFilter,
  LogFilterService,
  LogLevel,
  LogService,
  LogSourceStatus,
} from "#lib/logs/logs.types";

import { LogsLevelToggles } from "../LogsLevelToggles";
import { LogsMoreMenu } from "../LogsMoreMenu";
import { LogsSearchField } from "../LogsSearchField";
import { LogsServiceChips } from "../LogsServiceChips";
import { LogsSourcePicker } from "../LogsSourcePicker";

interface LogsToolbarProps {
  filter: LogFilter;
  isPhone: boolean;
  searchRef?: Ref<HTMLInputElement>;
  counts: {
    errorsByService: Record<LogFilterService, number>;
    byLevel: Record<LogLevel, number>;
    sources: string[];
  };
  statuses: Partial<Record<LogService, LogSourceStatus>>;
  isPaused: boolean;
  isWrapped: boolean;
  hasLines: boolean;
  onToggleService: (service: LogFilterService) => void;
  onToggleLevel: (level: LogLevel) => void;
  onSourceChange: (source: string | undefined) => void;
  onSearchChange: (text: string | undefined) => void;
  onPausedChange: (isPaused: boolean) => void;
  onWrappedChange: (isWrapped: boolean) => void;
  onCopyLink: () => void;
  onDownload: () => void;
  onClearFilters: () => void;
}

/**
 * Everything that shapes the timeline. Desktop: one wrapping row. Phone:
 * search and actions on top, the service chips scrolling sideways under
 * them, levels, source and wrap in a Filters sheet.
 */
export const LogsToolbar: FC<LogsToolbarProps> = ({
  filter,
  isPhone,
  searchRef,
  counts,
  statuses,
  isPaused,
  isWrapped,
  hasLines,
  onToggleService,
  onToggleLevel,
  onSourceChange,
  onSearchChange,
  onPausedChange,
  onWrappedChange,
  onCopyLink,
  onDownload,
  onClearFilters,
}) => {
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const chips = (
    <LogsServiceChips
      selected={filter.services}
      errorsByService={counts.errorsByService}
      statuses={statuses}
      onToggle={onToggleService}
    />
  );
  const levels = (
    <LogsLevelToggles
      selected={filter.levels}
      counts={counts.byLevel}
      onToggle={onToggleLevel}
    />
  );
  const source = (
    <LogsSourcePicker
      selected={filter.source}
      sources={counts.sources}
      onChange={onSourceChange}
      className={clsx(isPhone && "w-full max-w-none")}
    />
  );
  const wrap = (
    <Toggle
      variant="outline"
      size="sm"
      pressed={isWrapped}
      onPressedChange={onWrappedChange}
      className={clsx("aria-pressed:border-foreground/25")}
    >
      <WrapText />
      Wrap lines
    </Toggle>
  );
  const pause = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => onPausedChange(!isPaused)}
    >
      {isPaused ? <Play /> : <Pause />}
      {isPaused ? "Resume" : "Pause"}
    </Button>
  );
  const more = (
    <LogsMoreMenu
      hasFilter={Object.keys(filter).length > 0}
      hasLines={hasLines}
      onCopyLink={onCopyLink}
      onDownload={onDownload}
      onClearFilters={onClearFilters}
    />
  );
  const search = (
    <LogsSearchField
      ref={searchRef}
      value={filter.text}
      onChange={onSearchChange}
      className={clsx("flex-1 md:max-w-80 md:min-w-48")}
    />
  );

  if (!isPhone) {
    return (
      <div
        className={clsx(
          "flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5",
        )}
      >
        {chips}
        <div aria-hidden className={clsx("h-5 w-px bg-border")} />
        {levels}
        {source}
        {search}
        <div className={clsx("ml-auto flex items-center gap-2")}>
          {pause}
          {wrap}
          {more}
        </div>
      </div>
    );
  }

  const hiddenCount = (filter.levels ? 1 : 0) + (filter.source ? 1 : 0);

  return (
    <div className={clsx("flex flex-col gap-2 border-b pt-2 pb-2.5")}>
      <div className={clsx("flex items-center gap-2 px-4")}>
        {search}
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={isPaused ? "Resume" : "Pause"}
          onClick={() => onPausedChange(!isPaused)}
        >
          {isPaused ? <Play /> : <Pause />}
        </Button>
        {more}
      </div>
      <div
        className={clsx(
          "flex items-center gap-1.5 overflow-x-auto px-4",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        <Button
          variant="outline"
          size="sm"
          className={clsx("shrink-0 rounded-full")}
          onClick={() => setIsFiltersOpen(true)}
        >
          <SlidersHorizontal />
          {hiddenCount > 0 ? `Filters · ${hiddenCount}` : "Filters"}
        </Button>
        {chips}
      </div>
      <Sheet open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
        <SheetContent side="bottom" className={clsx("rounded-t-2xl")}>
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>
              Levels and source. Service chips stay above the list.
            </SheetDescription>
          </SheetHeader>
          <div
            className={clsx(
              "flex flex-col gap-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
            )}
          >
            <div className={clsx("flex flex-col gap-1.5")}>
              <span
                className={clsx("text-xs font-medium text-muted-foreground")}
              >
                Levels
              </span>
              {levels}
            </div>
            <div className={clsx("flex flex-col gap-1.5")}>
              <span
                className={clsx("text-xs font-medium text-muted-foreground")}
              >
                Source
              </span>
              {source}
            </div>
            <div>{wrap}</div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
