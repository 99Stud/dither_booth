import type { Rarity } from "@dither-booth/shared/lottery";
import type { FC } from "react";

import { capitalize } from "@dither-booth/shared/formatting";
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
import clsx from "clsx";
import { PartyPopper } from "lucide-react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";

import { RarityDot, rarityColor } from "#components/Misc/RarityBadge/index";

import {
  computeOdds,
  formatOneIn,
  formatPercent,
  type OddsPrize,
} from "../../lottery-odds.utils";

const NO_PRIZE = "noPrize";
/** De-emphasised grey: losing is context, the prizes are the story. */
const NO_PRIZE_COLOR =
  "color-mix(in oklch, var(--muted-foreground) 30%, transparent)";

type Segment = {
  key: Rarity | typeof NO_PRIZE;
  label: string;
  chance: number;
  color: string;
};

/**
 * What one guest can expect from a draw, in words people use: a hero
 * "1 in 4" figure, one 100% stacked bar (rarest first, "no prize" in grey)
 * and the same numbers as a labelled list, so colour never carries meaning
 * alone. Updates live as the settings change, before saving.
 */
export const LotteryOddsCard: FC<{
  enabled: boolean;
  noWinWeight: number;
  prizes: OddsPrize[];
}> = ({ enabled, noWinWeight, prizes }) => {
  const odds = computeOdds({ noWinWeight, prizes });
  const segments: Segment[] = [
    ...odds.byRarity.map((entry) => ({
      key: entry.rarity,
      label: capitalize(entry.rarity),
      chance: entry.chance,
      color: rarityColor(entry.rarity),
    })),
    ...(odds.winChance < 1
      ? [
          {
            key: NO_PRIZE,
            label: "No prize",
            chance: 1 - odds.winChance,
            color: NO_PRIZE_COLOR,
          } as const,
        ]
      : []),
  ];
  const chartConfig = Object.fromEntries(
    segments.map((segment) => [
      segment.key,
      { label: segment.label, color: segment.color },
    ]),
  ) satisfies ChartConfig;
  const row = Object.fromEntries(
    segments.map((segment) => [segment.key, segment.chance]),
  );
  const hasPrizes = odds.byPrize.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className={clsx("flex items-center gap-2.5")}>
          <IconBubble tone="rose">
            <PartyPopper />
          </IconBubble>
          What guests can expect
        </CardTitle>
        <CardDescription>
          {enabled
            ? "For each photo taken."
            : "Once the lottery is live. Right now nobody wins."}
        </CardDescription>
      </CardHeader>
      <CardContent className={clsx("flex flex-col gap-5")}>
        {!hasPrizes ? (
          <p
            className={clsx(
              "rounded-lg border border-dashed px-4 py-6 text-center",
              "text-sm text-muted-foreground",
            )}
          >
            No prize in stock yet: add some in the Prizes tab.
          </p>
        ) : (
          <>
            <div className={clsx("flex items-baseline gap-2")}>
              <span
                className={clsx(
                  "text-4xl font-semibold tracking-tight tabular-nums",
                )}
              >
                {formatOneIn(odds.winChance)}
              </span>
              <span className={clsx("text-sm text-muted-foreground")}>
                {odds.winChance >= 1
                  ? "wins a prize"
                  : `guests wins a prize (${formatPercent(odds.winChance)})`}
              </span>
            </div>

            <ChartContainer
              config={chartConfig}
              className={clsx("aspect-auto h-9 w-full")}
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
                    // A 2px gap in the surface colour between segments.
                    stroke="var(--card)"
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

            <ul className={clsx("grid gap-x-6 gap-y-2 sm:grid-cols-2")}>
              {segments.map((segment) => (
                <li
                  key={segment.key}
                  className={clsx("flex items-center gap-2 text-sm")}
                >
                  <span
                    aria-hidden
                    className={clsx("size-2.5 shrink-0 rounded-full")}
                    style={{ backgroundColor: segment.color }}
                  />
                  <span className={clsx("flex-1")}>{segment.label}</span>
                  <span className={clsx("text-muted-foreground tabular-nums")}>
                    {formatOneIn(segment.chance)}
                  </span>
                  <span
                    className={clsx("w-10 text-right font-medium tabular-nums")}
                  >
                    {formatPercent(segment.chance)}
                  </span>
                </li>
              ))}
            </ul>

            <div className={clsx("flex flex-col gap-1.5 border-t pt-4")}>
              <span
                className={clsx("text-xs font-medium text-muted-foreground")}
              >
                Per prize
              </span>
              <ul className={clsx("flex flex-col gap-1.5")}>
                {odds.byPrize.map((prize) => (
                  <li
                    key={prize.id}
                    className={clsx("flex items-center gap-2 text-sm")}
                  >
                    <RarityDot rarity={prize.rarity} />
                    <span className={clsx("min-w-0 flex-1 truncate")}>
                      {prize.title}
                    </span>
                    <span
                      className={clsx(
                        "text-xs text-muted-foreground tabular-nums",
                      )}
                    >
                      {prize.remainingQuantity} left
                    </span>
                    <span className={clsx("w-20 text-right tabular-nums")}>
                      {formatOneIn(prize.chance)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
