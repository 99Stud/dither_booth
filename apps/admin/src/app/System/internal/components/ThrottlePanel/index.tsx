import type { FC, ReactNode } from "react";

import { Badge } from "@dither-booth/ui/components/ui/badge";
import clsx from "clsx";
import { Check, CircleAlert, Fan, Gauge, History, Zap } from "lucide-react";

import type { SystemThrottleFlagKey } from "#lib/system/system.constants";
import type { SystemSample } from "#lib/system/system.protocol";
import type { SystemStatus } from "#lib/system/system.utils";

import { SYSTEM_THROTTLE_FLAGS } from "#lib/system/system.constants";
import { getStatusLabel, getThrottleStatus } from "#lib/system/system.utils";

import { useTweenedNumber } from "../../hooks/useTweenedNumber";
import { SystemPanel } from "../SystemPanel";

const THROTTLE_LABELS: Record<SystemStatus, string> = {
  ok: "Clean since boot",
  warning: "Flagged since boot",
  critical: "Throttling now",
};

type FlagState = "clear" | "sinceBoot" | "now";

const FLAG_STATES: Record<
  FlagState,
  { label: string; icon: ReactNode; className: string }
> = {
  clear: {
    label: "Clear",
    icon: <Check aria-hidden />,
    className: "text-muted-foreground",
  },
  sinceBoot: {
    label: "Since boot",
    icon: <History aria-hidden />,
    className: "border-warning/50 text-warning",
  },
  now: {
    label: "Now",
    icon: <CircleAlert aria-hidden />,
    className: "border-destructive/50 text-destructive",
  },
};

/** One flag's worst state: set now outranks set at some point since boot. */
const getFlagState = (
  throttle: NonNullable<SystemSample["thermal"]["throttle"]>,
  key: SystemThrottleFlagKey,
): FlagState =>
  throttle.now[key] ? "now" : throttle.sinceBoot[key] ? "sinceBoot" : "clear";

interface ThrottlePanelProps {
  thermal: SystemSample["thermal"];
  sources: SystemSample["sources"];
}

/**
 * How the Pi copes: its fan and clock, and the firmware's four throttle
 * flags, each as its worst state: clear, set since boot, or set now. Only
 * a set flag says what it means, so a clean board reads at a glance. A
 * flag since boot is the diagnosis an event's worth of "fine now" would
 * hide: an under-voltage that happened once means the supply, whatever the
 * gauge says.
 */
export const ThrottlePanel: FC<ThrottlePanelProps> = ({ thermal, sources }) => {
  const status = getThrottleStatus(thermal.throttle);
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
      contentClassName={clsx("flex flex-col gap-4")}
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
      {thermal.throttle === null ? (
        <p className={clsx("text-sm text-muted-foreground")}>
          {sources.throttle.message}
        </p>
      ) : (
        <ul aria-label="Throttle flags" className={clsx("divide-y")}>
          {SYSTEM_THROTTLE_FLAGS.map((flag) => {
            const flagState = getFlagState(thermal.throttle!, flag.key);
            const state = FLAG_STATES[flagState];

            return (
              <li
                key={flag.key}
                className={clsx(
                  "flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0",
                )}
              >
                <div className={clsx("min-w-0 text-sm")}>
                  <p className={clsx("font-medium")}>{flag.label}</p>
                  {flagState !== "clear" && (
                    <p className={clsx("mt-0.5 text-xs text-muted-foreground")}>
                      {flag.description}
                    </p>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={clsx("h-6 gap-1.5 px-2.5", state.className)}
                >
                  {state.icon}
                  {state.label}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </SystemPanel>
  );
};
