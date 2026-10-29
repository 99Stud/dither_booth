import type { FC, ReactNode } from "react";

import { Badge } from "@dither-booth/ui/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@dither-booth/ui/components/ui/popover";
import clsx from "clsx";
import { Check, CircleAlert, Fan, Gauge, History, Zap } from "lucide-react";

import type { SystemSample } from "#lib/system/system.protocol";
import type { SystemStatus } from "#lib/system/system.utils";

import { SYSTEM_THROTTLE_FLAGS } from "#lib/system/system.constants";
import {
  getStatusLabel,
  getThrottleFlagStatus,
  getThrottleStatus,
} from "#lib/system/system.utils";

import { useTweenedNumber } from "../../hooks/useTweenedNumber";
import { badgeToneClassName } from "../../System.utils";
import { SystemPanel } from "../SystemPanel";

const THROTTLE_LABELS: Record<SystemStatus, string> = {
  ok: "Clean since boot",
  warning: "Flagged since boot",
  critical: "Throttling now",
};

/** Each flag's state as a word and an icon, never colour alone. */
const FLAG_BADGES: Record<SystemStatus, { label: string; icon: ReactNode }> = {
  ok: { label: "Clear", icon: <Check aria-hidden /> },
  warning: { label: "Since boot", icon: <History aria-hidden /> },
  critical: { label: "Now", icon: <CircleAlert aria-hidden /> },
};

interface ThrottlePanelProps {
  thermal: SystemSample["thermal"];
  sources: SystemSample["sources"];
}

/**
 * How the Pi copes: its fan and clock, and the firmware's four throttle
 * flags, each as its worst state: clear, set since boot, or set now. A set
 * flag says what it means; a clear one keeps it a tap away on its name, so
 * a clean board reads at a glance. A
 * flag since boot is the diagnosis an event's worth of "fine now" would
 * hide: an under-voltage that happened once means the supply, whatever the
 * gauge says.
 */
export const ThrottlePanel: FC<ThrottlePanelProps> = ({ thermal, sources }) => {
  const { throttle } = thermal;
  const status = getThrottleStatus(throttle);
  const fanRpm = useTweenedNumber(thermal.fanRpm);
  const cpuMhz = useTweenedNumber(thermal.cpuMhz);

  return (
    <SystemPanel
      title="Throttling"
      icon={<Zap />}
      tone="amber"
      status={status}
      statusLabel={getStatusLabel(status, THROTTLE_LABELS)}
      className={clsx("lg:col-span-4")}
      contentClassName={clsx("flex flex-1 flex-col gap-4")}
    >
      <div className={clsx("flex flex-wrap gap-2")}>
        <Badge
          variant="outline"
          className={clsx("h-6 gap-1.5 px-2.5 tabular-nums")}
          title={sources.fan.message}
        >
          <Fan aria-hidden />
          {fanRpm === null ? "No fan reading" : `${fanRpm} rpm`}
        </Badge>
        <Badge
          variant="outline"
          className={clsx("h-6 gap-1.5 px-2.5 tabular-nums")}
          title={sources.cpuFrequency.message}
        >
          <Gauge aria-hidden />
          {cpuMhz === null ? "No clock reading" : `${cpuMhz} MHz`}
        </Badge>
      </div>
      {throttle === null ? (
        <p className={clsx("text-sm text-muted-foreground")}>
          {sources.throttle.message}
        </p>
      ) : (
        <ul
          aria-label="Throttle flags"
          className={clsx("flex flex-1 flex-col divide-y")}
        >
          {SYSTEM_THROTTLE_FLAGS.map((flag) => {
            const flagStatus = getThrottleFlagStatus(throttle, flag.key);
            const badge = FLAG_BADGES[flagStatus];

            return (
              <li
                key={flag.key}
                className={clsx(
                  "flex flex-1 items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0",
                )}
              >
                <div className={clsx("min-w-0 text-sm")}>
                  {flagStatus === "ok" ? (
                    <Popover>
                      <PopoverTrigger
                        className={clsx(
                          "cursor-help rounded-sm text-left font-medium underline decoration-muted-foreground/50 decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                        )}
                      >
                        {flag.label}
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className={clsx("w-64 text-xs")}
                      >
                        {flag.description}
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <>
                      <p className={clsx("font-medium")}>{flag.label}</p>
                      <p
                        className={clsx("mt-0.5 text-xs text-muted-foreground")}
                      >
                        {flag.description}
                      </p>
                    </>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={clsx(
                    "h-6 gap-1.5 px-2.5",
                    flagStatus === "ok"
                      ? "text-muted-foreground"
                      : badgeToneClassName(flagStatus),
                  )}
                >
                  {badge.icon}
                  {badge.label}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </SystemPanel>
  );
};
