import type { FC } from "react";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@dither-booth/ui/components/ui/chart";
import clsx from "clsx";
import { Bar, BarChart, XAxis, YAxis } from "recharts";

import { formatOneIn, formatPercent } from "../../lottery-odds.utils";

/** De-emphasised grey: losing is context, the prizes are the story. */
export const NO_PRIZE_COLOR =
  "color-mix(in oklch, var(--muted-foreground) 30%, transparent)";

export type DrawBarSegment = {
  /** A CSS-identifier-safe key: it names the `--color-*` variable. */
  key: string;
  label: string;
  chance: number;
  color: string;
};

/**
 * One draw as a 100% stacked bar: a segment per outcome, a 2px gap in the
 * surface colour between them, and a tooltip with the % and "1 in N".
 * Pair it with a labelled legend, so colour never carries meaning alone.
 */
export const DrawBar: FC<{
  segments: DrawBarSegment[];
  /** The colour behind the bar, for the gaps (`--popover` in a dialog). */
  surface?: string;
  className?: string;
}> = ({ segments, surface = "var(--card)", className }) => {
  const chartConfig = Object.fromEntries(
    segments.map((segment) => [
      segment.key,
      { label: segment.label, color: segment.color },
    ]),
  ) satisfies ChartConfig;
  const row = Object.fromEntries(
    segments.map((segment) => [segment.key, segment.chance]),
  );

  return (
    <ChartContainer
      config={chartConfig}
      className={clsx("aspect-auto h-9 w-full", className)}
    >
      <BarChart
        accessibilityLayer
        data={[row]}
        layout="vertical"
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        barCategoryGap={0}
      >
        <XAxis type="number" domain={[0, 1]} hide />
        <YAxis type="category" hide />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(value, name) => (
                <div
                  className={clsx(
                    "flex w-full items-center justify-between gap-4",
                  )}
                >
                  <span>{chartConfig[String(name)]?.label}</span>
                  <span className={clsx("font-mono tabular-nums")}>
                    {formatPercent(Number(value))} ·{" "}
                    {formatOneIn(Number(value))}
                  </span>
                </div>
              )}
            />
          }
        />
        {segments.map((segment, index) => (
          <Bar
            key={segment.key}
            dataKey={segment.key}
            stackId="draw"
            fill={`var(--color-${segment.key})`}
            stroke={surface}
            strokeWidth={2}
            radius={[
              index === 0 ? 6 : 0,
              index === segments.length - 1 ? 6 : 0,
              index === segments.length - 1 ? 6 : 0,
              index === 0 ? 6 : 0,
            ]}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
};

/** The bar's legend: dot, label, "1 in N" and %, for every segment. */
export const DrawBarLegend: FC<{
  segments: DrawBarSegment[];
  className?: string;
}> = ({ segments, className }) => (
  <ul className={clsx("grid gap-x-6 gap-y-2 sm:grid-cols-2", className)}>
    {segments.map((segment) => (
      <li key={segment.key} className={clsx("flex items-center gap-2 text-sm")}>
        <span
          aria-hidden
          className={clsx("size-2.5 shrink-0 rounded-full")}
          style={{ backgroundColor: segment.color }}
        />
        <span className={clsx("min-w-0 flex-1 truncate")}>{segment.label}</span>
        <span className={clsx("text-muted-foreground tabular-nums")}>
          {formatOneIn(segment.chance)}
        </span>
        <span className={clsx("w-10 text-right font-medium tabular-nums")}>
          {formatPercent(segment.chance)}
        </span>
      </li>
    ))}
  </ul>
);
