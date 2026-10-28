import type { FC } from "react";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@dither-booth/ui/components/ui/chart";
import clsx from "clsx";
import { format } from "date-fns";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import type { SystemPoint } from "#lib/system/system.utils";

// The same step in both themes, the one that passes the chart checks on each
// card: --chart-1/2 are too light on the dark card, --chart-3 too gray on white.
const chartConfig = {
  value: {
    label: "Value",
    theme: { light: "var(--chart-2)", dark: "var(--chart-3)" },
  },
} satisfies ChartConfig;

/** Four time labels across the range, whatever its length. */
const pickTicks = (points: SystemPoint[]) => {
  const last = points.length - 1;

  if (last < 3) {
    return points.map((point) => point.t);
  }

  return [0, 1, 2, 3].map((step) => points[Math.round((last * step) / 3)]!.t);
};

interface SystemAreaChartProps {
  title: string;
  points: SystemPoint[];
  unit: string;
  decimals?: number;
  /** Fixed bounds, e.g. 0 to 100 for a share. Defaults to the data's. */
  domain?: [number, number];
  /** What to say while there aren't two readings to draw. */
  emptyText: string;
  className?: string;
}

/**
 * One series over the chart range, as a shadcn area chart. Readings arrive
 * every few seconds, so the chart redraws without animation: a line that
 * springs on each sample reads as flicker.
 */
export const SystemAreaChart: FC<SystemAreaChartProps> = ({
  title,
  points,
  unit,
  decimals = 0,
  domain,
  emptyText,
  className,
}) => {
  const values = points
    .map((point) => point.value)
    .filter((value): value is number => value !== null);
  const min = values.length ? Math.min(...values) : undefined;
  const max = values.length ? Math.max(...values) : undefined;
  const range =
    min !== undefined && max !== undefined
      ? `${min.toFixed(decimals)} to ${max.toFixed(decimals)} ${unit}`
      : undefined;
  const first = points[0];
  const last = points[points.length - 1];
  const span =
    first && last
      ? `from ${format(first.t, "HH:mm")} to ${format(last.t, "HH:mm")}`
      : "";

  return (
    <figure className={clsx("flex min-w-0 flex-col gap-2", className)}>
      <figcaption
        className={clsx(
          "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm",
        )}
      >
        <span className={clsx("font-medium")}>{title}</span>
        {range && (
          <span className={clsx("text-muted-foreground tabular-nums")}>
            {range}
          </span>
        )}
      </figcaption>
      <p className={clsx("sr-only")}>
        {range ? `${title} ${span}: ${range}.` : emptyText}
      </p>
      {values.length < 2 ? (
        <p
          className={clsx(
            "flex h-32 items-center justify-center rounded-lg bg-muted/50 px-4 text-center text-sm text-muted-foreground",
          )}
        >
          {emptyText}
        </p>
      ) : (
        <ChartContainer
          aria-hidden
          config={chartConfig}
          className={clsx("aspect-auto h-32 w-full")}
        >
          <AreaChart
            data={points}
            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              ticks={pickTicks(points)}
              tickFormatter={(t: number) => format(t, "HH:mm")}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
            />
            <YAxis
              domain={domain ?? ["auto", "auto"]}
              width={36}
              tickCount={3}
              tickLine={false}
              axisLine={false}
            />
            <ChartTooltip
              cursor={{ stroke: "var(--border)" }}
              content={
                <ChartTooltipContent
                  hideIndicator
                  labelFormatter={(_, payload) =>
                    format(Number(payload[0]?.payload?.t), "HH:mm:ss")
                  }
                  formatter={(value) => (
                    <span className={clsx("w-full text-right tabular-nums")}>
                      {Number(value).toFixed(decimals)} {unit}
                    </span>
                  )}
                />
              }
            />
            <Area
              dataKey="value"
              type="monotone"
              stroke="var(--color-value)"
              strokeWidth={2}
              fill="var(--color-value)"
              fillOpacity={0.15}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </figure>
  );
};
