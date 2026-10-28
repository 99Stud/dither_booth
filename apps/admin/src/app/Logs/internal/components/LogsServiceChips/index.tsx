import type { FC } from "react";

import { Toggle } from "@dither-booth/ui/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@dither-booth/ui/components/ui/tooltip";
import clsx from "clsx";
import { CircleSlash } from "lucide-react";

import type {
  LogFilter,
  LogFilterService,
  LogService,
  LogSourceStatus,
} from "#lib/logs/logs.types";

import { LOG_FILTER_SERVICES } from "#lib/logs/logs.constants";
import { isLogLevelShown, isLogServiceShown } from "#lib/logs/logs.utils";

import { LOG_SERVICE_LABELS } from "../../Logs.constants";

interface LogsServiceChipsProps {
  /**
   * What shows. Counts only cover lines the page holds, and history only
   * holds what shows, so a hidden service, or hidden errors, get no count.
   */
  filter: LogFilter;
  errorsByService: Record<LogFilterService, number>;
  statuses: Partial<Record<LogService, LogSourceStatus>>;
  onToggle: (service: LogFilterService) => void;
}

const isSourceService = (service: LogFilterService): service is LogService =>
  service !== "browser";

/**
 * One chip per service: pressed when its lines show, with its error count
 * while it and errors show, and a mark when its log source is unavailable
 * (hover for why).
 */
export const LogsServiceChips: FC<LogsServiceChipsProps> = ({
  filter,
  errorsByService,
  statuses,
  onToggle,
}) => (
  <div
    role="group"
    aria-label="Services"
    className={clsx("flex shrink-0 items-center gap-1.5")}
  >
    {LOG_FILTER_SERVICES.map((service) => {
      const isPressed = isLogServiceShown(filter, service);
      const errors =
        isPressed && isLogLevelShown(filter, "error")
          ? errorsByService[service]
          : 0;
      const status = isSourceService(service) ? statuses[service] : undefined;
      const isUnavailable = status?.state === "unavailable";

      const chip = (
        <Toggle
          variant="outline"
          size="sm"
          pressed={isPressed}
          onPressedChange={() => onToggle(service)}
          className={clsx(
            "shrink-0 gap-1.5 rounded-full",
            "aria-pressed:border-foreground/25 aria-pressed:bg-muted",
            "not-aria-pressed:text-muted-foreground",
          )}
        >
          {LOG_SERVICE_LABELS[service]}
          {errors > 0 && (
            <span
              className={clsx(
                "rounded-full bg-destructive/10 px-1.5 text-[0.6875rem] font-semibold text-destructive tabular-nums",
                "dark:bg-destructive/20",
              )}
            >
              {errors}
              <span className="sr-only">{` error${errors === 1 ? "" : "s"}`}</span>
            </span>
          )}
          {isUnavailable && (
            <>
              <CircleSlash
                aria-hidden
                className={clsx("text-muted-foreground")}
              />
              <span className="sr-only">{`, unavailable: ${status.message}`}</span>
            </>
          )}
        </Toggle>
      );

      if (!isUnavailable) {
        return (
          <span key={service} className={clsx("contents")}>
            {chip}
          </span>
        );
      }

      return (
        <Tooltip key={service}>
          <TooltipTrigger render={<span />}>{chip}</TooltipTrigger>
          <TooltipContent>{status.message}</TooltipContent>
        </Tooltip>
      );
    })}
  </div>
);
