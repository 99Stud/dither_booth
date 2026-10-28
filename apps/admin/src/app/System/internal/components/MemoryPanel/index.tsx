import type { FC } from "react";

import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@dither-booth/ui/components/ui/progress";
import clsx from "clsx";
import { MemoryStick } from "lucide-react";

import type { SystemSample } from "#lib/system/system.protocol";
import type { SystemPoint, SystemStatus } from "#lib/system/system.utils";

import {
  CHART_WAITING_TEXT,
  GIB,
  formatBytes,
  freePercent,
  getMemoryStatus,
  getStatusLabel,
} from "#lib/system/system.utils";

import { useTweenedNumber } from "../../hooks/useTweenedNumber";
import { progressToneClassName } from "../../System.utils";
import { SystemAreaChart } from "../SystemAreaChart";
import { SystemPanel } from "../SystemPanel";

const MEMORY_LABELS: Record<SystemStatus, string> = {
  ok: "Plenty free",
  warning: "Running low",
  critical: "Nearly full",
};

interface MemoryPanelProps {
  memory: SystemSample["memory"];
  points: SystemPoint[];
}

/**
 * RAM as the kernel counts it: available includes the cache it gives back
 * on demand, so that is the figure, not "free". PM2 restarts the engine
 * past 1 GB; this is where a leak shows before it does.
 */
export const MemoryPanel: FC<MemoryPanelProps> = ({ memory, points }) => {
  const status = getMemoryStatus(memory);
  const availablePercent =
    memory.availableBytes === null
      ? null
      : freePercent(memory.availableBytes, memory.totalBytes);
  const usedPercent = useTweenedNumber(
    availablePercent === null ? null : 100 - availablePercent,
    1,
  );
  const availableGb = useTweenedNumber(
    memory.availableBytes === null ? null : memory.availableBytes / GIB,
    2,
  );
  const swapPercent = useTweenedNumber(
    memory.swapTotalBytes > 0
      ? 100 -
          freePercent(
            memory.swapTotalBytes - memory.swapUsedBytes,
            memory.swapTotalBytes,
          )
      : null,
    1,
  );

  return (
    <SystemPanel
      title="Memory"
      icon={<MemoryStick />}
      tone="violet"
      status={status}
      statusLabel={getStatusLabel(status, MEMORY_LABELS)}
      className={clsx("lg:col-span-12")}
      contentClassName={clsx("grid gap-6 lg:grid-cols-2 lg:items-center")}
    >
      <div className={clsx("flex flex-col gap-5")}>
        <p className={clsx("flex flex-wrap items-baseline gap-x-2")}>
          <span
            className={clsx(
              "text-3xl leading-none font-semibold tracking-tight tabular-nums",
            )}
          >
            {availableGb === null ? "--" : `${availableGb.toFixed(2)} GB`}
          </span>
          <span className={clsx("text-sm text-muted-foreground")}>
            {memory.availableBytes === null ? "of" : "available of"}{" "}
            {formatBytes(memory.totalBytes)}
          </span>
        </p>
        {memory.availableBytes === null ? (
          <p className={clsx("text-sm text-muted-foreground")}>
            Only the Pi's kernel says how much memory is available. Here, the
            total is all this machine reports.
          </p>
        ) : (
          <>
            <Progress
              value={usedPercent ?? 0}
              className={clsx("gap-y-2", progressToneClassName(status))}
            >
              <ProgressLabel>Used</ProgressLabel>
              <ProgressValue />
            </Progress>
            <p className={clsx("-mt-3 text-xs text-muted-foreground")}>
              Available counts {formatBytes(memory.cachedBytes)} of cache the
              kernel gives back when an app needs it.
            </p>
          </>
        )}
        {memory.swapTotalBytes > 0 && (
          <Progress value={swapPercent ?? 0} className={clsx("gap-y-2")}>
            <ProgressLabel>zram swap</ProgressLabel>
            <ProgressValue>
              {() =>
                `${formatBytes(memory.swapUsedBytes)} of ${formatBytes(memory.swapTotalBytes)}`
              }
            </ProgressValue>
          </Progress>
        )}
      </div>
      <SystemAreaChart
        title="Available over the range"
        points={points}
        unit="%"
        domain={[0, 100]}
        emptyText={CHART_WAITING_TEXT}
      />
    </SystemPanel>
  );
};
