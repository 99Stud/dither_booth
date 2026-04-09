import { createInitialSignalSeries, shiftSignalSeries } from "#app/Splash/internal/SplashHud.utils.ts";
import { ChartContainer, RechartsPrimitive } from "../../../components/ui/chart.tsx";
import { type FC, useEffect, useState } from "react";

const CHART_POINT_COUNT = 42;

const {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} = RechartsPrimitive;

export const SplashHudSignalChart: FC<{ reduceMotion: boolean }> = (props) => {
  const { reduceMotion } = props;

  const [series, setSeries] = useState(() =>
    createInitialSignalSeries(CHART_POINT_COUNT),
  );

  useEffect(() => {
    if (reduceMotion) {
      setSeries(createInitialSignalSeries(CHART_POINT_COUNT));
      return;
    }

    let nextIndex = CHART_POINT_COUNT;
    const interval = window.setInterval(() => {
      setSeries((currentSeries) => shiftSignalSeries(currentSeries, nextIndex++));
    }, 190);

    return () => {
      window.clearInterval(interval);
    };
  }, [reduceMotion]);

  return (
    <ChartContainer
      config={{
        signal: {
          color: "var(--color-primary)",
          label: "Signal",
        },
      }}
      className="pointer-events-none aspect-auto h-full min-h-0 w-full select-none"
    >
      <AreaChart
        accessibilityLayer={false}
        data={series}
        margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
      >
        <Tooltip active={false} cursor={false} />
        <defs>
          <linearGradient id="splash-signal-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-signal)" stopOpacity={0.22} />
            <stop offset="50%" stopColor="var(--color-signal)" stopOpacity={0.1} />
            <stop offset="100%" stopColor="var(--color-signal)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          horizontal
          vertical={false}
          stroke="oklch(0.78 0.11 195 / 0.08)"
          strokeDasharray="3 6"
        />
        <ReferenceLine
          ifOverflow="extendDomain"
          stroke="oklch(0.72 0.18 48 / 0.14)"
          y={52}
        />
        <XAxis dataKey="index" hide />
        <YAxis domain={[0, 100]} hide />
        <Area
          activeDot={false}
          dataKey="value"
          fill="url(#splash-signal-fill)"
          isAnimationActive={false}
          stroke="var(--color-signal)"
          strokeOpacity={0.45}
          strokeWidth={1.25}
          type="monotone"
        />
      </AreaChart>
    </ChartContainer>
  );
};
