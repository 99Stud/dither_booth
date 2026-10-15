import type { FC } from "react";

import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@dither-booth/ui/components/ui/chart";
import { Input } from "@dither-booth/ui/components/ui/input";
import clsx from "clsx";
import { Hourglass } from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  forecastPrizes,
  formatDuration,
  type OddsPrize,
} from "../../lottery-odds.utils";

const GUESTS_PER_HOUR_STORAGE_KEY = "dither-booth.admin.guests-per-hour";
const DEFAULT_GUESTS_PER_HOUR = 60;

const chartConfig = {
  left: { label: "Prizes left", color: "var(--chart-1)" },
} satisfies ChartConfig;

const readGuestsPerHour = () => {
  try {
    const stored = Number(localStorage.getItem(GUESTS_PER_HOUR_STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0
      ? stored
      : DEFAULT_GUESTS_PER_HOUR;
  } catch {
    return DEFAULT_GUESTS_PER_HOUR;
  }
};

/**
 * "Will the prizes last the night?" From an estimate of guests per hour,
 * the expected prizes left over time (cooldown and running-out prizes
 * included), the win pace and when stock runs out. An area chart: one
 * series, change over time.
 */
export const LotteryForecastCard: FC<{
  noWinWeight: number;
  winCooldownMinutes: number;
  prizes: OddsPrize[];
}> = ({ noWinWeight, winCooldownMinutes, prizes }) => {
  const [guestsPerHour, setGuestsPerHour] = useState(readGuestsPerHour);
  const forecast = forecastPrizes({
    prizes,
    noWinWeight,
    cooldownMinutes: winCooldownMinutes,
    guestsPerHour,
  });
  const totalLeft = forecast.points[0]?.left ?? 0;
  const lastMinute = forecast.points.at(-1)?.minute ?? 0;
  // Every hour for short forecasts, every 3 h past 8 h, so phones stay legible.
  const tickHours = lastMinute > 8 * 60 ? 3 : 1;
  const hourTicks = forecast.points
    .map((point) => point.minute)
    .filter((minute) => minute % (tickHours * 60) === 0);
  const isCappedByCooldown =
    forecast.cooldownCapPerHour !== null &&
    forecast.winsPerHour >= forecast.cooldownCapPerHour * 0.8;

  const updateGuestsPerHour = (value: number) => {
    setGuestsPerHour(value);
    try {
      localStorage.setItem(GUESTS_PER_HOUR_STORAGE_KEY, String(value));
    } catch {
      // Remembering the estimate is a convenience only.
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className={clsx("flex items-center gap-2.5")}>
          <IconBubble tone="sky">
            <Hourglass />
          </IconBubble>
          Will the prizes last?
        </CardTitle>
        <CardDescription>An estimate, not a promise.</CardDescription>
      </CardHeader>
      <CardContent className={clsx("flex flex-col gap-4")}>
        <label
          className={clsx("flex flex-wrap items-center gap-2 text-sm")}
          htmlFor="guests-per-hour"
        >
          With about
          <Input
            id="guests-per-hour"
            className={clsx("h-8 w-20 text-center tabular-nums")}
            inputMode="numeric"
            min={1}
            type="number"
            value={guestsPerHour}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next) && next > 0) updateGuestsPerHour(next);
            }}
          />
          guests an hour:
        </label>

        {totalLeft === 0 ? (
          <p className={clsx("text-sm text-muted-foreground")}>
            No prize in stock.
          </p>
        ) : (
          <>
            <div className={clsx("grid grid-cols-2 gap-3")}>
              <div className={clsx("rounded-lg bg-muted/60 px-3 py-2")}>
                <div className={clsx("text-xs text-muted-foreground")}>
                  Prizes per hour
                </div>
                <div className={clsx("text-xl font-semibold tabular-nums")}>
                  ≈ {Math.round(forecast.winsPerHour * 10) / 10}
                </div>
              </div>
              <div className={clsx("rounded-lg bg-muted/60 px-3 py-2")}>
                <div className={clsx("text-xs text-muted-foreground")}>
                  Stock runs out
                </div>
                <div className={clsx("text-xl font-semibold tabular-nums")}>
                  {forecast.runsOutAfterMinutes === null
                    ? "12 h+"
                    : `in ${formatDuration(forecast.runsOutAfterMinutes)}`}
                </div>
              </div>
            </div>

            {isCappedByCooldown && (
              <p className={clsx("text-sm text-muted-foreground")}>
                The {winCooldownMinutes} min pause after each win holds it to at
                most {Math.round((forecast.cooldownCapPerHour ?? 0) * 10) / 10}{" "}
                wins an hour.
              </p>
            )}

            <ChartContainer
              config={chartConfig}
              className={clsx("aspect-auto h-44 w-full")}
            >
              <AreaChart
                accessibilityLayer
                data={forecast.points}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="minute"
                  type="number"
                  domain={[0, "dataMax"]}
                  ticks={hourTicks}
                  tickFormatter={(minute: number) => `${minute / 60} h`}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, payload) =>
                        `After ${formatDuration(Number(payload[0]?.payload?.minute ?? 0))}`
                      }
                      formatter={(value) => (
                        <div
                          className={clsx(
                            "flex w-full items-center justify-between gap-4",
                          )}
                        >
                          <span>Prizes left</span>
                          <span className={clsx("font-mono tabular-nums")}>
                            ≈ {Math.round(Number(value))}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Area
                  dataKey="left"
                  type="monotone"
                  stroke="var(--color-left)"
                  strokeWidth={2}
                  fill="var(--color-left)"
                  fillOpacity={0.15}
                />
              </AreaChart>
            </ChartContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
};
