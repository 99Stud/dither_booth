import type { FC } from "react";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@dither-booth/ui/components/ui/chart";
import clsx from "clsx";
import { Cpu } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import type { SystemSample } from "#lib/system/system.protocol";
import type { SystemPoint, SystemStatus } from "#lib/system/system.utils";

import {
  CHART_WAITING_TEXT,
  getCpuStatus,
  getStatusLabel,
} from "#lib/system/system.utils";

import { useTweenedNumber } from "../../hooks/useTweenedNumber";
import { SystemAreaChart } from "../SystemAreaChart";
import { SystemPanel } from "../SystemPanel";

const CPU_LABELS: Record<SystemStatus, string> = {
  ok: "Keeping up",
  warning: "Busy",
  critical: "Overloaded",
};

const loadConfig = {
  load: {
    label: "Load",
    theme: { light: "var(--chart-2)", dark: "var(--chart-3)" },
  },
} satisfies ChartConfig;

interface CpuPanelProps {
  cpu: SystemSample["cpu"];
  points: SystemPoint[];
}

/**
 * How busy the four cores are: the share of time busy since the last
 * read, and the load averages against the core count, where queued work
 * shows before the temperature does.
 */
export const CpuPanel: FC<CpuPanelProps> = ({ cpu, points }) => {
  const status = getCpuStatus(cpu);
  const usage = useTweenedNumber(cpu.usagePercent);
  const loads = [
    { window: "1 min", load: cpu.load[0] },
    { window: "5 min", load: cpu.load[1] },
    { window: "15 min", load: cpu.load[2] },
  ];
  const maxLoad = Math.max(cpu.cores * 1.25, ...cpu.load);

  return (
    <SystemPanel
      title="CPU"
      icon={<Cpu />}
      tone="emerald"
      status={status}
      statusLabel={getStatusLabel(status, CPU_LABELS)}
      className={clsx("lg:col-span-6")}
      contentClassName={clsx("flex flex-col gap-5")}
    >
      <p className={clsx("flex flex-wrap items-baseline gap-x-2")}>
        <span
          className={clsx(
            "text-3xl leading-none font-semibold tracking-tight tabular-nums",
          )}
        >
          {usage === null ? "--" : `${usage}%`}
        </span>
        <span className={clsx("text-sm text-muted-foreground")}>
          busy across {cpu.cores} cores
        </span>
      </p>
      <figure className={clsx("flex min-w-0 flex-col gap-2")}>
        <figcaption
          className={clsx(
            "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm",
          )}
        >
          <span className={clsx("font-medium")}>Load average</span>
          <span className={clsx("text-muted-foreground")}>
            against {cpu.cores} cores
          </span>
        </figcaption>
        <p className={clsx("sr-only")}>
          {loads
            .map((entry) => `${entry.window}: ${entry.load.toFixed(2)}`)
            .join(", ")}
          , against {cpu.cores} cores.
        </p>
        <ChartContainer
          aria-hidden
          config={loadConfig}
          className={clsx("aspect-auto h-24 w-full")}
        >
          <BarChart
            data={loads}
            layout="vertical"
            margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
          >
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis
              type="number"
              domain={[0, maxLoad]}
              tickCount={4}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => value.toFixed(1)}
            />
            <YAxis
              type="category"
              dataKey="window"
              width={44}
              tickLine={false}
              axisLine={false}
            />
            {/* The core count: a bar past it is work waiting its turn. */}
            <ReferenceLine
              x={cpu.cores}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
            />
            <ChartTooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={
                <ChartTooltipContent
                  hideIndicator
                  formatter={(value) => (
                    <span className={clsx("w-full text-right tabular-nums")}>
                      {Number(value).toFixed(2)}
                    </span>
                  )}
                />
              }
            />
            <Bar
              dataKey="load"
              fill="var(--color-load)"
              radius={[0, 4, 4, 0]}
              maxBarSize={14}
              isAnimationActive={false}
            >
              {/* Past the cores, work is queueing: the bar says so too. */}
              {loads.map((entry) => (
                <Cell
                  key={entry.window}
                  fill={
                    entry.load > cpu.cores
                      ? "var(--warning)"
                      : "var(--color-load)"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </figure>
      <SystemAreaChart
        title="Busy over the range"
        points={points}
        unit="%"
        domain={[0, 100]}
        emptyText={CHART_WAITING_TEXT}
        className={clsx("[&_[data-slot=chart]]:h-24")}
      />
    </SystemPanel>
  );
};
