import type { FC } from "react";

import { Badge } from "@dither-booth/ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dither-booth/ui/components/ui/table";
import clsx from "clsx";
import { Check, CircleAlert, Fan, Gauge, History, Zap } from "lucide-react";

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

/** Yes or no, as an icon and a word. "Now" is urgent, "since boot" a record. */
const FlagCell: FC<{ active: boolean; when: "now" | "sinceBoot" }> = ({
  active,
  when,
}) =>
  active ? (
    <span
      className={clsx(
        "inline-flex items-center gap-1 font-medium",
        when === "now" ? "text-destructive" : "text-foreground",
      )}
    >
      {when === "now" ? <CircleAlert aria-hidden /> : <History aria-hidden />}
      Yes
    </span>
  ) : (
    <span
      className={clsx("inline-flex items-center gap-1 text-muted-foreground")}
    >
      <Check aria-hidden />
      No
    </span>
  );

interface ThrottlePanelProps {
  thermal: SystemSample["thermal"];
  sources: SystemSample["sources"];
}

/**
 * How the Pi copes: its fan and clock, and the firmware's four throttle
 * flags, each now and since boot. A flag since boot is the diagnosis an
 * event's worth of "fine now" would hide: an under-voltage that happened
 * once means the supply, whatever the gauge says.
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
        <Table aria-label="Throttle flags">
          <TableHeader>
            <TableRow>
              <TableHead>Flag</TableHead>
              <TableHead className={clsx("text-right")}>Now</TableHead>
              <TableHead className={clsx("text-right")}>Since boot</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SYSTEM_THROTTLE_FLAGS.map((flag) => (
              <TableRow key={flag.key}>
                <TableCell className={clsx("whitespace-normal")}>
                  <span className={clsx("font-medium")}>{flag.label}</span>
                  <span className={clsx("block text-xs text-muted-foreground")}>
                    {flag.description}
                  </span>
                </TableCell>
                <TableCell className={clsx("text-right align-top")}>
                  <FlagCell
                    active={thermal.throttle!.now[flag.key]}
                    when="now"
                  />
                </TableCell>
                <TableCell className={clsx("text-right align-top")}>
                  <FlagCell
                    active={thermal.throttle!.sinceBoot[flag.key]}
                    when="sinceBoot"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SystemPanel>
  );
};
