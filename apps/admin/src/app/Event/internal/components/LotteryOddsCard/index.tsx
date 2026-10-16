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
import clsx from "clsx";
import { PartyPopper } from "lucide-react";

import { RarityDot, rarityColor } from "#components/Misc/RarityBadge/index";

import {
  computeOdds,
  formatOneIn,
  formatPercent,
  type OddsPrize,
} from "../../lottery-odds.utils";
import {
  DrawBar,
  DrawBarLegend,
  type DrawBarSegment,
  NO_PRIZE_COLOR,
} from "../DrawBar/index";

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
  const segments: DrawBarSegment[] = [
    ...odds.byRarity.map((entry) => ({
      key: entry.rarity,
      label: capitalize(entry.rarity),
      chance: entry.chance,
      color: rarityColor(entry.rarity),
    })),
    ...(odds.winChance < 1
      ? [
          {
            key: "noPrize",
            label: "No prize",
            chance: 1 - odds.winChance,
            color: NO_PRIZE_COLOR,
          },
        ]
      : []),
  ];
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

            <DrawBar segments={segments} />

            <DrawBarLegend segments={segments} />

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
