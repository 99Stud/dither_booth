import type { FC, ReactNode } from "react";

import { Card, CardContent } from "@dither-booth/ui/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@dither-booth/ui/components/ui/chart";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { formatDistanceToNowStrict } from "date-fns";
import { TriangleAlert, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { useTRPC } from "#lib/trpc/trpc.client";

import type { VisitStats } from "../../Event.types";

import {
  formatHour,
  formatHourRange,
  formatVisitLength,
  getBusiestHour,
} from "../../guests.utils";

/** How often the card refreshes, so it follows the night live. */
const VISIT_STATS_POLL_MS = 10_000;

// The same step in both themes, the one that passes the chart checks on each
// card: --chart-1/2 are too light on the dark card, --chart-3 too gray on white.
const chartConfig = {
  visits: {
    label: "Guests",
    theme: { light: "var(--chart-2)", dark: "var(--chart-3)" },
  },
} satisfies ChartConfig;

/**
 * The event's guests, first on the Overview: how many so far, when they
 * came over the night, and the few facts staff act on. Counted from the
 * booth's visits.
 */
export const EventGuestsCard: FC = () => {
  const trpc = useTRPC();
  const { data: stats } = useQuery({
    ...trpc.config.getVisitStats.queryOptions(),
    refetchInterval: VISIT_STATS_POLL_MS,
  });
  if (!stats) return null;

  return (
    <Card>
      <CardContent className={clsx("flex flex-col gap-6")}>
        {stats.visits === 0 ? (
          <NoGuestsYet />
        ) : (
          <>
            <div
              className={clsx(
                "flex flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-10",
              )}
            >
              <Headline stats={stats} />
              <GuestsPerHour hourly={stats.hourly} />
            </div>
            <Facts stats={stats} />
          </>
        )}
      </CardContent>
    </Card>
  );
};

const Label: FC<{ children: ReactNode }> = ({ children }) => (
  <div
    className={clsx(
      "flex items-center gap-2 text-sm font-medium text-muted-foreground",
    )}
  >
    <Users className={clsx("size-4")} aria-hidden />
    {children}
  </div>
);

const NoGuestsYet: FC = () => (
  <div className={clsx("flex flex-col gap-2")}>
    <Label>Guests</Label>
    <p className={clsx("text-2xl font-semibold tracking-tight")}>
      No guests yet
    </p>
    <p className={clsx("text-sm text-muted-foreground")}>
      Each guest shows up here from their first tap on Start.
    </p>
  </div>
);

const Headline: FC<{ stats: VisitStats }> = ({ stats }) => (
  <div className={clsx("flex shrink-0 flex-col gap-1 lg:w-52")}>
    <Label>Guests</Label>
    <p
      className={clsx(
        "mt-1 text-5xl leading-none font-semibold tracking-tight tabular-nums",
      )}
    >
      {stats.visits}
    </p>
    <p className={clsx("mt-1 text-sm text-muted-foreground")}>
      {/* A visit completes when its tickets print: completed is prints. */}
      {stats.completed} printed
      {stats.wins > 0 && ` · ${stats.wins} won a prize`}
    </p>
  </div>
);

const GuestsPerHour: FC<{ hourly: VisitStats["hourly"] }> = ({ hourly }) => {
  const isQuiet = hourly.every((entry) => entry.visits === 0);

  return (
    <figure className={clsx("flex min-w-0 flex-1 flex-col gap-2")}>
      <figcaption className={clsx("flex items-baseline justify-between gap-2")}>
        <span className={clsx("text-sm font-medium")}>Guests per hour</span>
        <span className={clsx("text-xs text-muted-foreground")}>
          Last 12 hours
        </span>
      </figcaption>
      {isQuiet ? (
        <p
          className={clsx(
            "flex h-36 items-center justify-center rounded-lg bg-muted/50 text-sm text-muted-foreground",
          )}
        >
          No guests in the last 12 hours.
        </p>
      ) : (
        <ChartContainer
          config={chartConfig}
          className={clsx("aspect-auto h-36 w-full")}
        >
          <BarChart
            accessibilityLayer
            data={hourly}
            margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="hour"
              tickFormatter={formatHour}
              // Every third hour, counted back from the current one, so the
              // hour staff look at always has its label.
              ticks={hourly
                .filter((_, index) => (hourly.length - 1 - index) % 3 === 0)
                .map((entry) => entry.hour)}
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
            />
          </BarChart>
        </ChartContainer>
      )}
    </figure>
  );
};

/** What staff act on, in words. A fact without data is left out. */
const Facts: FC<{ stats: VisitStats }> = ({ stats }) => {
  const busiest = getBusiestHour(stats.hourly);

  return (
    <dl
      className={clsx(
        "grid grid-cols-2 gap-x-6 gap-y-4 border-t pt-4 sm:flex sm:flex-wrap sm:gap-x-10",
      )}
    >
      {stats.lastVisitAt && (
        <Fact label="Last guest">{formatLastGuest(stats.lastVisitAt)}</Fact>
      )}
      {stats.avgDurationS !== null && (
        <Fact label="Average visit">
          {formatVisitLength(stats.avgDurationS)}
        </Fact>
      )}
      {busiest && (
        <Fact label="Busiest hour">
          {formatHour(busiest.hour)}
          <span className={clsx("font-normal text-muted-foreground")}>
            {" "}
            · {busiest.visits} {busiest.visits === 1 ? "guest" : "guests"}
          </span>
        </Fact>
      )}
      {stats.failed > 0 && (
        <Fact label="Printing failed">
          <span className={clsx("inline-flex items-center gap-1.5")}>
            <TriangleAlert
              className={clsx("size-4 text-warning")}
              aria-hidden
            />
            {stats.failed} {stats.failed === 1 ? "guest" : "guests"}
          </span>
        </Fact>
      )}
    </dl>
  );
};

const Fact: FC<{ label: string; children: ReactNode }> = ({
  label,
  children,
}) => (
  <div className={clsx("flex min-w-0 flex-col gap-0.5")}>
    <dt className={clsx("text-xs text-muted-foreground")}>{label}</dt>
    <dd className={clsx("text-sm font-medium tabular-nums")}>{children}</dd>
  </div>
);

const formatLastGuest = (iso: string) => {
  const at = new Date(iso);
  return Date.now() - at.getTime() < 60_000
    ? "Just now"
    : formatDistanceToNowStrict(at, { addSuffix: true });
};
