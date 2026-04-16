import { cn } from "#lib/utils.ts";
import * as React from "react";
import {
  Legend as RechartsLegend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";

type ChartConfig = Record<
  string,
  {
    label?: string;
    color?: string;
  }
>;

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null);

export const ChartContainer: React.FC<
  React.ComponentProps<"div"> & {
    config: ChartConfig;
    children: React.ReactNode;
  }
> = (props) => {
  const { className, config, children, style, ...rest } = props;

  const cssVars = Object.fromEntries(
    Object.entries(config).flatMap(([key, value]) =>
      value.color ? [[`--color-${key}`, value.color]] : [],
    ),
  ) as React.CSSProperties;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        className={cn(
          "h-[260px] w-full rounded-none border border-border bg-card px-2 py-3",
          className,
        )}
        style={{ ...cssVars, ...style }}
        {...rest}
      >
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
};

export const ChartTooltip = RechartsTooltip;
export const ChartLegend = RechartsLegend;

type ChartTooltipPayloadItem = {
  dataKey?: string | number;
  name?: string | number;
  color?: string;
  value?: string | number;
};

type ChartTooltipContentProps = {
  active?: boolean;
  payload?: ChartTooltipPayloadItem[];
  label?: string | number;
  labelKey?: string;
  nameKey?: string;
};

export const ChartTooltipContent: React.FC<ChartTooltipContentProps> = (props) => {
  const { active, payload, label } = props;
  const context = React.useContext(ChartContext);

  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="rounded-none border border-border bg-card px-3 py-2 text-xs shadow-md">
      {label !== undefined && (
        <div className="mb-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {String(label)}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {payload.map((item) => {
          const key = String(item.dataKey ?? item.name ?? "");
          const series = context?.config[key];
          const color = item.color ?? series?.color ?? "currentColor";

          return (
            <div key={key} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-none"
                  style={{ backgroundColor: color }}
                />
                <span className="text-muted-foreground">
                  {series?.label ?? item.name ?? key}
                </span>
              </div>
              <span className="tabular-nums text-foreground">
                {typeof item.value === "number"
                  ? item.value.toFixed(1).replace(/\.0$/, "")
                  : String(item.value ?? "")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export type { ChartConfig };
