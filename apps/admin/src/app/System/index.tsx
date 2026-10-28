import { Button } from "@dither-booth/ui/components/ui/button";
import clsx from "clsx";
import { WifiOff } from "lucide-react";
import { useMemo, useState } from "react";

import {
  AppPageBody,
  AppPageHeading,
  AppSidebarPageHeader,
} from "#components/Layout/AppSidebar/external/components/AppSidebarPageHeader/index";
import {
  SYSTEM_HISTORY_SAMPLES,
  SYSTEM_RECENT_SAMPLES,
} from "#lib/system/system.constants";
import { isSystemStale, toPoints } from "#lib/system/system.utils";
import { useSystemMetrics } from "#lib/system/useSystemMetrics";

import { CpuPanel } from "./internal/components/CpuPanel";
import { MemoryPanel } from "./internal/components/MemoryPanel";
import { StoragePanel } from "./internal/components/StoragePanel";
import { SystemFooter } from "./internal/components/SystemFooter";
import {
  type SystemRange,
  SystemRangeTabs,
} from "./internal/components/SystemRangeTabs";
import { SystemSkeleton } from "./internal/components/SystemSkeleton";
import { SystemStatusBadge } from "./internal/components/SystemStatusBadge";
import { SystemUnavailable } from "./internal/components/SystemUnavailable";
import { ThermalPanel } from "./internal/components/ThermalPanel";
import { ThrottlePanel } from "./internal/components/ThrottlePanel";
import { usePanelEntrance } from "./internal/hooks/usePanelEntrance";

const RANGE_SAMPLES: Record<SystemRange, number> = {
  recent: SYSTEM_RECENT_SAMPLES,
  hour: SYSTEM_HISTORY_SAMPLES,
};

/**
 * The Pi under the booth, live: heat first, then memory, CPU and storage,
 * with the last hour behind each number. Served by the admin server, so
 * it keeps working while the engine is down, which is when it matters.
 */
export const System = () => {
  const { data, isPending, isError, error, isFetching, refetch } =
    useSystemMetrics();
  const [range, setRange] = useState<SystemRange>("hour");
  const gridRef = usePanelEntrance<HTMLDivElement>(data !== undefined);
  const count = RANGE_SAMPLES[range];
  const points = useMemo(
    () =>
      data && {
        celsius: toPoints(data.history, "celsius", count),
        availablePercent: toPoints(data.history, "availablePercent", count),
        cpuPercent: toPoints(data.history, "cpuPercent", count),
      },
    [data, count],
  );
  const connection = isError
    ? "offline"
    : data && isSystemStale(data)
      ? "stale"
      : "live";

  return (
    <>
      <AppSidebarPageHeader title="System" />
      <AppPageBody>
        <AppPageHeading
          title="System"
          description="The Pi under the booth: heat, memory, CPU and storage, live."
          actions={
            <>
              <SystemStatusBadge state={connection} />
              <SystemRangeTabs value={range} onChange={setRange} />
            </>
          }
        />
        {isPending ? (
          <SystemSkeleton />
        ) : !data || !points ? (
          <SystemUnavailable
            message={
              error instanceof Error
                ? error.message
                : "The admin server didn't answer."
            }
            isRetrying={isFetching}
            onRetry={() => void refetch()}
          />
        ) : (
          <>
            {isError && (
              <div
                role="alert"
                className={clsx(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                )}
              >
                <WifiOff
                  aria-hidden
                  className={clsx("size-4 shrink-0 text-destructive")}
                />
                <span>
                  Can't reach the admin server. Showing the last reading.
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className={clsx("ml-auto")}
                  onClick={() => void refetch()}
                  disabled={isFetching}
                >
                  Retry
                </Button>
              </div>
            )}
            <div ref={gridRef} className={clsx("grid gap-4 lg:grid-cols-12")}>
              <ThermalPanel
                thermal={data.thermal}
                source={data.sources.thermal}
                points={points.celsius}
              />
              <ThrottlePanel thermal={data.thermal} sources={data.sources} />
              <MemoryPanel
                memory={data.memory}
                points={points.availablePercent}
              />
              <CpuPanel cpu={data.cpu} points={points.cpuPercent} />
              <StoragePanel disks={data.disks} />
            </div>
            <SystemFooter snapshot={data} now={Date.now()} />
          </>
        )}
      </AppPageBody>
    </>
  );
};
