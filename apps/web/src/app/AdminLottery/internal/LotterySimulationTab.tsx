import { Badge } from "#components/ui/badge.tsx";
import { Button } from "#components/ui/button.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#components/ui/card.tsx";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "#components/ui/chart.tsx";
import { Field, FieldDescription, FieldLabel } from "#components/ui/field.tsx";
import { Input } from "#components/ui/input.tsx";
import { useTRPC } from "#lib/trpc/trpc.utils.ts";
import { useMutation } from "@tanstack/react-query";
import { type FC, type ReactNode, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

const hourlyChartConfig = {
  meanAttempts: { label: "Mean attempts", color: "oklch(0.72 0.04 90)" },
  meanWins: { label: "Mean wins", color: "oklch(0.75 0.16 145)" },
  meanForcedLosses: {
    label: "Mean forced losses",
    color: "oklch(0.65 0.22 25)",
  },
  meanWinRatePct: { label: "Mean win rate", color: "oklch(0.74 0.17 45)" },
  p10WinRatePct: { label: "P10 win rate", color: "oklch(0.66 0.1 45)" },
  p90WinRatePct: { label: "P90 win rate", color: "oklch(0.8 0.14 45)" },
} satisfies ChartConfig;

const probCurveConfig = {
  meanPPct: { label: "Mean P(win)", color: "oklch(0.75 0.16 145)" },
  p10PPct: { label: "P10 P(win)", color: "oklch(0.64 0.12 145)" },
  p90PPct: { label: "P90 P(win)", color: "oklch(0.83 0.12 145)" },
  meanStockPct: {
    label: "Mean stock remaining",
    color: "oklch(0.72 0.04 90)",
  },
} satisfies ChartConfig;

const lotChartConfig = {
  meanDistributionRatePct: {
    label: "Mean distributed %",
    color: "oklch(0.74 0.17 45)",
  },
} satisfies ChartConfig;

export const LotterySimulationTab: FC = () => {
  const trpc = useTRPC();
  const simulateLottery = useMutation(trpc.simulateLottery.mutationOptions());

  const [attempts, setAttempts] = useState(500);
  const [samples, setSamples] = useState(50);
  const [profile, setProfile] = useState<"normal" | "bursty" | "mixed">("normal");

  const simulation = simulateLottery.data;

  const hourlyChartData = useMemo(
    () =>
      simulation?.hourly.map((row) => ({
        hour: row.hour,
        meanAttempts: row.attempts.mean,
        meanWins: row.wins.mean,
        meanForcedLosses: row.forcedLosses.mean,
        meanWinRatePct: Number((row.winRate.mean * 100).toFixed(1)),
        p10WinRatePct: Number((row.winRate.p10 * 100).toFixed(1)),
        p90WinRatePct: Number((row.winRate.p90 * 100).toFixed(1)),
      })) ?? [],
    [simulation],
  );

  const minuteChartData = useMemo(
    () =>
      simulation?.byMinute.map((row) => ({
        minute: row.minute,
        meanAttempts: row.attempts.mean,
        meanWinRatePct: Number((row.winRate.mean * 100).toFixed(1)),
        p10WinRatePct: Number((row.winRate.p10 * 100).toFixed(1)),
        p90WinRatePct: Number((row.winRate.p90 * 100).toFixed(1)),
      })) ?? [],
    [simulation],
  );

  const probCurveData = useMemo(
    () =>
      simulation?.probCurve.map((point) => ({
        elapsedPct: point.elapsedPct,
        meanPPct: Number(point.pPct.mean.toFixed(1)),
        p10PPct: Number(point.pPct.p10.toFixed(1)),
        p90PPct: Number(point.pPct.p90.toFixed(1)),
        meanStockPct: Number(point.stockPct.mean.toFixed(1)),
      })) ?? [],
    [simulation],
  );

  const lotChartData = useMemo(
    () =>
      simulation?.perLot.map((lot) => ({
        ...lot,
        meanDistributionRatePct: Number((lot.distributionRate.mean * 100).toFixed(1)),
        p10DistributionRatePct: Number((lot.distributionRate.p10 * 100).toFixed(1)),
        p90DistributionRatePct: Number((lot.distributionRate.p90 * 100).toFixed(1)),
        coverageRatePct: Number((lot.coverageRate * 100).toFixed(1)),
      })) ?? [],
    [simulation],
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Simulation</CardTitle>
          <CardDescription>
            Runs the live lottery engine offline. The enabled toggle is ignored, and Monte Carlo
            repeats the full run many times to show mean outcomes and spread.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Field>
              <FieldLabel htmlFor="simulation-attempts">Attempts</FieldLabel>
              <FieldDescription>
                How many synthetic draws to run inside the configured daily window.
              </FieldDescription>
              <Input
                id="simulation-attempts"
                type="number"
                min="10"
                max="20000"
                value={attempts}
                onChange={(event) => setAttempts(Number(event.target.value))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="simulation-samples">Samples</FieldLabel>
              <FieldDescription>
                Number of full runs to aggregate. Higher values reduce noise.
              </FieldDescription>
              <Input
                id="simulation-samples"
                type="number"
                min="1"
                max="200"
                value={samples}
                onChange={(event) => setSamples(Number(event.target.value))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="simulation-profile">Traffic shape</FieldLabel>
              <FieldDescription>
                Even spacing, bursty abuse pressure, or a mixed profile.
              </FieldDescription>
              <select
                id="simulation-profile"
                className="h-9 w-full border border-input bg-transparent px-2 text-xs"
                value={profile}
                onChange={(event) =>
                  setProfile(event.target.value as "normal" | "bursty" | "mixed")
                }
              >
                <option value="normal">Normal (even)</option>
                <option value="bursty">Bursty (stress anti-abuse)</option>
                <option value="mixed">Mixed</option>
              </select>
            </Field>
            <div className="flex items-end">
              <Button
                className="w-full"
                onClick={() => simulateLottery.mutate({ attempts, samples, profile })}
                disabled={simulateLottery.isPending}
              >
                {simulateLottery.isPending ? "Running…" : "Run"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {!simulation ? (
        <p className="text-xs text-muted-foreground">
          Run a Monte Carlo simulation to see aggregate charts.
        </p>
      ) : null}

      {simulation && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryStatCard
              label="Samples"
              value={simulation.samples}
              helper={`${simulation.attemptsPerSample} attempts each`}
            />
            <SummaryStatCard
              label="Total simulated attempts"
              value={simulation.totalSimulatedAttempts}
            />
            <SummaryStatCard
              label="Mean wins"
              value={simulation.wins.mean}
              range={`${simulation.wins.p10.toFixed(0)}–${simulation.wins.p90.toFixed(0)}`}
              badge={<Badge variant="success">{simulation.wins.p50.toFixed(0)} median</Badge>}
            />
            <SummaryStatCard
              label="Mean forced losses"
              value={simulation.forcedLosses.mean}
              range={`${simulation.forcedLosses.p10.toFixed(0)}–${simulation.forcedLosses.p90.toFixed(0)}`}
              badge={
                simulation.abuseTriggeredRate > 0 ? (
                  <Badge variant="destructive">
                    {(simulation.abuseTriggeredRate * 100).toFixed(1)}% runs
                  </Badge>
                ) : undefined
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryStatCard
              label="Eligible draws"
              value={simulation.eligibleAttempts.mean}
              range={`${simulation.eligibleAttempts.p10.toFixed(0)}–${simulation.eligibleAttempts.p90.toFixed(0)}`}
            />
            <SummaryStatCard
              label="Effective win rate"
              value={`${(simulation.effectiveWinRate.mean * 100).toFixed(1)}%`}
              range={`${(simulation.effectiveWinRate.p10 * 100).toFixed(1)}–${(simulation.effectiveWinRate.p90 * 100).toFixed(1)}%`}
            />
            <SummaryStatCard
              label="Avg P(win)"
              value={`${(simulation.avgWinProbability.mean * 100).toFixed(1)}%`}
              range={`${(simulation.avgWinProbability.p10 * 100).toFixed(1)}–${(simulation.avgWinProbability.p90 * 100).toFixed(1)}%`}
            />
            <SummaryStatCard
              label="Peak P(win)"
              value={`${(simulation.peakWinProbability.mean * 100).toFixed(1)}%`}
              range={`${(simulation.peakWinProbability.p10 * 100).toFixed(1)}–${(simulation.peakWinProbability.p90 * 100).toFixed(1)}%`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Monte Carlo probability curve</CardTitle>
              <CardDescription>
                Mean P(win) and remaining stock over the session. Dashed lines show the P10/P90
                spread between runs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={probCurveConfig} className="h-[280px]">
                <LineChart accessibilityLayer data={probCurveData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="elapsedPct" unit="%" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis unit="%" tickLine={false} axisLine={false} domain={[0, 100]} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="meanStockPct"
                    stroke="var(--color-meanStockPct)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="p10PPct"
                    stroke="var(--color-p10PPct)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="meanPPct"
                    stroke="var(--color-meanPPct)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="p90PPct"
                    stroke="var(--color-p90PPct)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Mean counts by hour</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={hourlyChartConfig} className="h-[260px]">
                  <BarChart accessibilityLayer data={hourlyChartData}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="hour" tickLine={false} tickMargin={8} axisLine={false} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="meanAttempts" fill="var(--color-meanAttempts)" radius={0} />
                    <Bar dataKey="meanWins" fill="var(--color-meanWins)" radius={0} />
                    <Bar
                      dataKey="meanForcedLosses"
                      fill="var(--color-meanForcedLosses)"
                      radius={0}
                    />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Hourly win rate spread</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={hourlyChartConfig} className="h-[260px]">
                  <LineChart accessibilityLayer data={hourlyChartData}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="hour" tickLine={false} tickMargin={8} axisLine={false} />
                    <YAxis unit="%" tickLine={false} axisLine={false} domain={[0, 100]} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line
                      type="monotone"
                      dataKey="p10WinRatePct"
                      stroke="var(--color-p10WinRatePct)"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="meanWinRatePct"
                      stroke="var(--color-meanWinRatePct)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="p90WinRatePct"
                      stroke="var(--color-p90WinRatePct)"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Per-minute win rate spread</CardTitle>
              <CardDescription>
                Monte Carlo mean win rate and P10/P90 band by clock minute (only minutes that
                received at least one attempt in each run).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={hourlyChartConfig} className="h-[300px]">
                <LineChart accessibilityLayer data={minuteChartData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="minute"
                    tickLine={false}
                    tickMargin={4}
                    axisLine={false}
                    minTickGap={12}
                    tick={{ fontSize: 9 }}
                    angle={-35}
                    textAnchor="end"
                    height={48}
                  />
                  <YAxis unit="%" tickLine={false} axisLine={false} domain={[0, 100]} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="p10WinRatePct"
                    stroke="var(--color-p10WinRatePct)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="meanWinRatePct"
                    stroke="var(--color-meanWinRatePct)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="p90WinRatePct"
                    stroke="var(--color-p90WinRatePct)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mean lot distribution</CardTitle>
              <CardDescription>
                Mean percentage distributed for each lot across all samples.
              </CardDescription>
              <CardAction className="text-[10px] text-muted-foreground">
                {(simulation.fullDepletionRate * 100).toFixed(1)}% full depletion
              </CardAction>
            </CardHeader>
            <CardContent>
              <ChartContainer config={lotChartConfig} className="h-[300px]">
                <BarChart accessibilityLayer data={lotChartData} layout="vertical">
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    unit="%"
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 100]}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    width={90}
                    tick={{ fontSize: 11 }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="meanDistributionRatePct"
                    fill="var(--color-meanDistributionRatePct)"
                    radius={0}
                    label={{
                      position: "right",
                      fontSize: 10,
                      formatter: (value) => `${String(value)}%`,
                    }}
                  />
                </BarChart>
              </ChartContainer>
              <div className="mt-4 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                {lotChartData.map((lot) => (
                  <div
                    key={lot.id}
                    className="flex items-center justify-between gap-3 border-t pt-2"
                  >
                    <span className="truncate">{lot.label}</span>
                    <span className="tabular-nums">
                      {lot.p10DistributionRatePct.toFixed(1)}–{lot.p90DistributionRatePct.toFixed(1)}%
                      {" · "}
                      coverage {lot.coverageRatePct.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

const SummaryStatCard: FC<{
  label: string;
  value: number | string;
  badge?: ReactNode;
  range?: string;
  helper?: string;
}> = (props) => {
  const { label, value, badge, range, helper } = props;

  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-4">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tabular-nums">
            {typeof value === "number" ? value.toFixed(1).replace(/\.0$/, "") : value}
          </span>
          {badge}
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        {range ? (
          <span className="text-[10px] leading-tight text-muted-foreground/70">p10–p90 {range}</span>
        ) : null}
        {helper ? (
          <span className="text-[10px] leading-tight text-muted-foreground/70">{helper}</span>
        ) : null}
      </CardContent>
    </Card>
  );
};
