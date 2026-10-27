import type { FC, ReactNode } from "react";

import { Card, CardContent } from "@dither-booth/ui/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@dither-booth/ui/components/ui/chart";
import clsx from "clsx";
import { format } from "date-fns";
import { ArrowRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";

import type { VisitStats } from "../../Event.types";

import {
  formatHour,
  formatHourRange,
  formatTimeAtBooth,
  type OverviewSummary,
} from "../../overview.utils";

// The same step in both themes, the one that passes the chart checks on each
// card: --chart-1/2 are too light on the dark card, --chart-3 too gray on white.
const chartConfig = {
  visits: {
    label: "Guests",
    theme: { light: "var(--chart-2)", dark: "var(--chart-3)" },
  },
} satisfies ChartConfig;

type Shareable = OverviewSummary["shareable"];

const guests = (count: number) =>
  `${count} ${count === 1 ? "guest" : "guests"}`;

/**
 * The event's outcome, the part a client may see: four numbers, how guests
 * went through the booth, and guests per hour over the event. Nothing here
 * is about the booth's health or what staff should do.
 */
export const EventGuestsCard: FC<{
  shareable: Shareable;
  recentVisits: number;
  hourly: VisitStats["hourly"];
}> = ({ shareable, recentVisits, hourly }) => (
  <Card>
    <CardContent className={clsx("flex flex-col gap-6")}>
      <Numbers shareable={shareable} recentVisits={recentVisits} />
      <GuestPath shareable={shareable} />
      <GuestsPerHour hourly={hourly} busiestHour={shareable.busiestHour} />
    </CardContent>
  </Card>
);

const Numbers: FC<{ shareable: Shareable; recentVisits: number }> = ({
  shareable,
  recentVisits,
}) => (
  <dl className={clsx("grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4")}>
    <Stat label="Guests" value={shareable.guests}>
      {recentVisits > 0 && `${recentVisits} in the last 15 min`}
    </Stat>
    <Stat label="Photos printed" value={shareable.prints}>
      {shareable.printShare !== null &&
        `${Math.round(shareable.printShare * 100)}% of guests`}
    </Stat>
    {shareable.prizesWon !== null && (
      <Stat label="Prizes won" value={shareable.prizesWon}>
        {shareable.guestsPerWin !== null &&
          `1 in ${shareable.guestsPerWin} guests won`}
      </Stat>
    )}
    {shareable.timeAtBoothS !== null && (
      <Stat
        label="Time at the booth"
        value={formatTimeAtBooth(shareable.timeAtBoothS)}
      >
        on average
      </Stat>
    )}
  </dl>
);

const Stat: FC<{
  label: string;
  value: ReactNode;
  children?: ReactNode;
}> = ({ label, value, children }) => (
  <div className={clsx("flex min-w-0 flex-col gap-1")}>
    <dt className={clsx("text-sm text-muted-foreground")}>{label}</dt>
    <dd
      className={clsx(
        "text-3xl leading-none font-semibold tracking-tight tabular-nums",
      )}
    >
      {value}
    </dd>
    {children && (
      <dd className={clsx("text-sm text-muted-foreground")}>{children}</dd>
    )}
  </div>
);

/** Started, took a photo, got their ticket; and who walked away. */
const GuestPath: FC<{ shareable: Shareable }> = ({ shareable }) => {
  const steps = [
    { label: "Started", value: shareable.guests },
    { label: "Took a photo", value: shareable.captured },
    { label: "Got their ticket", value: shareable.prints },
  ];

  return (
    <div
      className={clsx(
        "flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between",
      )}
    >
      <ol
        aria-label="How guests went through the booth"
        className={clsx("flex flex-wrap items-center gap-x-2 gap-y-1 text-sm")}
      >
        {steps.map((step, index) => (
          <li key={step.label} className={clsx("flex items-center gap-2")}>
            {index > 0 && (
              <ArrowRight
                className={clsx("size-3.5 text-muted-foreground")}
                aria-hidden
              />
            )}
            <span className={clsx("text-muted-foreground")}>{step.label}</span>
            <span className={clsx("font-medium tabular-nums")}>
              {step.value}
            </span>
          </li>
        ))}
      </ol>
      <p className={clsx("text-sm")}>
        <span className={clsx("text-muted-foreground")}>Walked away </span>
        <span className={clsx("font-medium tabular-nums")}>
          {shareable.walkedAway}
        </span>
      </p>
    </div>
  );
};

const GuestsPerHour: FC<{
  hourly: VisitStats["hourly"];
  busiestHour: Shareable["busiestHour"];
}> = ({ hourly, busiestHour }) => {
  const currentHour = hourly.at(-1)?.hour;
  // Every hour when they fit, else every third counted back from now, so
  // the hour staff look at always has its label.
  const step = hourly.length > 8 ? 3 : 1;
  const ticks = hourly
    .filter((_, index) => (hourly.length - 1 - index) % step === 0)
    .map((entry) => entry.hour);
  // The busiest hour can fall before the hours shown: then it needs its day.
  const busiestLabel =
    busiestHour &&
    (hourly.some((entry) => entry.hour === busiestHour.hour)
      ? formatHour(busiestHour.hour)
      : format(new Date(busiestHour.hour), "EEE d MMM, HH:mm"));
  const summary = busiestHour
    ? `Busiest hour ${busiestLabel}, with ${guests(busiestHour.visits)}.`
    : "No guests yet.";

  return (
    <figure className={clsx("flex min-w-0 flex-col gap-2")}>
      <figcaption
        className={clsx(
          "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1",
        )}
      >
        <span className={clsx("text-sm font-medium")}>Guests per hour</span>
        {busiestHour && (
          <span className={clsx("text-sm text-muted-foreground")}>
            Busiest {busiestLabel}, {guests(busiestHour.visits)}
          </span>
        )}
      </figcaption>
      <p className={clsx("sr-only")}>
        {summary}{" "}
        {hourly
          .filter((entry) => entry.visits > 0)
          .map((entry) => `${formatHour(entry.hour)}: ${entry.visits}`)
          .join(", ")}
      </p>
      <ChartContainer
        aria-hidden
        config={chartConfig}
        className={clsx("aspect-auto h-36 w-full")}
      >
        <BarChart
          data={hourly}
          margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="hour"
            tickFormatter={(hour: string) =>
              hour === currentHour ? "Now" : formatHour(hour)
            }
            ticks={ticks}
            // Drops labels that would touch on a phone; "Now" always stays.
            interval="preserveEnd"
            minTickGap={16}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <YAxis
            allowDecimals={false}
            tickCount={3}
            tickLine={false}
            axisLine={false}
            width={28}
          />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) =>
                  formatHourRange(String(payload[0]?.payload?.hour))
                }
              />
            }
          />
          <Bar
            dataKey="visits"
            fill="var(--color-visits)"
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
          >
            {/* The hour still running is lighter: it isn't over yet. */}
            {hourly.map((entry) => (
              <Cell
                key={entry.hour}
                fillOpacity={entry.hour === currentHour ? 0.55 : 1}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </figure>
  );
};
