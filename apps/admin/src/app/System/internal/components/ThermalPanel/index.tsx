import type { FC } from "react";

import {
  type ChartConfig,
  ChartContainer,
} from "@dither-booth/ui/components/ui/chart";
import clsx from "clsx";
import { Thermometer } from "lucide-react";
import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";

import type { SystemSample, SystemSource } from "#lib/system/system.protocol";
import type { SystemPoint } from "#lib/system/system.utils";

import {
  SYSTEM_TEMPERATURE_CRITICAL_C,
  SYSTEM_TEMPERATURE_GAUGE_MAX_C,
} from "#lib/system/system.constants";
import {
  CHART_WAITING_TEXT,
  READ_ON_THE_BOOTH_TEXT,
  TEMPERATURE_LABELS,
  activeThrottleFlags,
  getStatusLabel,
  getTemperatureStatus,
  getThermalStatus,
} from "#lib/system/system.utils";

import { useTweenedNumber } from "../../hooks/useTweenedNumber";
import { SystemAreaChart } from "../SystemAreaChart";
import { SystemPanel } from "../SystemPanel";

interface ThermalPanelProps {
  thermal: SystemSample["thermal"];
  source: SystemSource;
  points: SystemPoint[];
}

/**
 * The page's lead: the SoC's temperature on a gauge that ends where the
 * Pi 5 throttles hard, and its course over the chart range. Heat is the
 * one thing a venue (a hot room, a blocked blower) changes. The chart
 * fills the card's height, so the row never leaves a band under it.
 */
export const ThermalPanel: FC<ThermalPanelProps> = ({
  thermal,
  source,
  points,
}) => {
  const status = getThermalStatus(thermal);
  const temperatureStatus = getTemperatureStatus(thermal.celsius);
  const shown = useTweenedNumber(thermal.celsius, 1);
  const throttlingNow =
    thermal.throttle !== null &&
    activeThrottleFlags(thermal.throttle.now).length > 0;
  const statusLabel = throttlingNow
    ? "Throttling"
    : getStatusLabel(temperatureStatus, TEMPERATURE_LABELS);
  const gaugeConfig = {
    temperature: {
      label: "Temperature",
      color:
        status === "critical"
          ? "var(--destructive)"
          : status === "warning"
            ? "var(--warning)"
            : "var(--chart-2)",
    },
  } satisfies ChartConfig;

  return (
    <SystemPanel
      title="Temperature"
      icon={<Thermometer />}
      tone="rose"
      status={status}
      statusLabel={statusLabel}
      className={clsx("lg:col-span-8")}
      contentClassName={clsx(
        "grid flex-1 gap-6 sm:grid-cols-[auto_minmax(0,1fr)]",
      )}
    >
      <div className={clsx("relative mx-auto size-48 self-center")}>
        <ChartContainer
          aria-hidden
          config={gaugeConfig}
          className={clsx("absolute inset-0 aspect-auto h-full w-full")}
        >
          <RadialBarChart
            data={[{ name: "temperature", value: shown ?? 0 }]}
            startAngle={225}
            endAngle={-45}
            innerRadius="80%"
            outerRadius="100%"
            barSize={14}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, SYSTEM_TEMPERATURE_GAUGE_MAX_C]}
              tick={false}
              axisLine={false}
            />
            <RadialBar
              dataKey="value"
              background
              cornerRadius={7}
              fill="var(--color-temperature)"
              isAnimationActive={false}
            />
          </RadialBarChart>
        </ChartContainer>
        <div
          className={clsx(
            "absolute inset-0 flex flex-col items-center justify-center",
          )}
        >
          <span
            className={clsx(
              "text-5xl leading-none font-semibold tracking-tight tabular-nums",
            )}
          >
            {shown === null ? "--" : shown.toFixed(1)}
            <span className={clsx("text-xl text-muted-foreground")}> °C</span>
          </span>
          <span className={clsx("mt-2 text-xs text-muted-foreground")}>
            {thermal.celsius === null
              ? READ_ON_THE_BOOTH_TEXT
              : `throttles at ${SYSTEM_TEMPERATURE_CRITICAL_C} °C`}
          </span>
        </div>
      </div>
      {thermal.celsius === null ? (
        <p className={clsx("self-center text-sm text-muted-foreground")}>
          {source.message}
        </p>
      ) : (
        <SystemAreaChart
          title="Over the range"
          points={points}
          unit="°C"
          decimals={1}
          emptyText={CHART_WAITING_TEXT}
          fill
        />
      )}
    </SystemPanel>
  );
};
