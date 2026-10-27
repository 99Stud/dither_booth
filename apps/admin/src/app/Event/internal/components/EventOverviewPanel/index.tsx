import type { Rarity } from "@dither-booth/shared/lottery";
import type { FC } from "react";

import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import clsx from "clsx";
import { ArrowRight, Dices } from "lucide-react";

import { rarityColor } from "#components/Misc/RarityBadge/index";

import type { CurrentEvent } from "../../Event.types";

import { getRarityBreakdown, getRemainingPrizes } from "../../Event.utils";
import { EventGuestsCard } from "../EventGuestsCard/index";

interface EventOverviewPanelProps {
  event: CurrentEvent;
  onOpenLottery: () => void;
}

/**
 * The night at a glance: the guests first, then where the lottery stands.
 * Editing lives elsewhere: the name in the page header, the ticket in Kit.
 */
export const EventOverviewPanel: FC<EventOverviewPanelProps> = ({
  event,
  onOpenLottery,
}) => (
  <div className={clsx("flex flex-col gap-4 md:gap-6")}>
    <EventGuestsCard />
    <LotterySummaryCard event={event} onOpen={onOpenLottery} />
  </div>
);

/**
 * Where the lottery stands, in one line each: live or off, the prizes left,
 * the pause after a win. Its settings live on the Lottery tab.
 */
const LotterySummaryCard: FC<{ event: CurrentEvent; onOpen: () => void }> = ({
  event,
  onOpen,
}) => {
  const remainingPrizes = getRemainingPrizes(event);
  const { enabled, winCooldownMinutes } = event.lottery;

  return (
    <Card>
      <CardHeader>
        <CardTitle className={clsx("flex items-center gap-2.5")}>
          <IconBubble tone="violet">
            <Dices />
          </IconBubble>
          Lottery
          <span
            className={clsx(
              "ml-auto inline-flex items-center gap-1.5 text-sm font-medium",
              enabled ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <span
              aria-hidden
              className={clsx(
                "size-2 rounded-full",
                enabled ? "bg-success" : "bg-muted-foreground/50",
              )}
            />
            {enabled ? "Live" : "Off"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className={clsx("flex flex-col gap-4")}>
        <div className={clsx("flex flex-col gap-2")}>
          <p className={clsx("text-sm")}>
            <span className={clsx("font-semibold tabular-nums")}>
              {remainingPrizes}
            </span>{" "}
            {remainingPrizes === 1 ? "prize" : "prizes"} left
            {winCooldownMinutes > 0 && (
              <span className={clsx("text-muted-foreground")}>
                {" "}
                · {winCooldownMinutes} min pause after a win
              </span>
            )}
          </p>
          <RarityBar breakdown={getRarityBreakdown(event)} />
        </div>
        <div className={clsx("flex justify-end")}>
          <Button type="button" variant="outline" onClick={onOpen}>
            Lottery settings
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

/** The prizes left by rarity, as one small segmented bar (hover for counts). */
const RarityBar: FC<{
  breakdown: Array<{ rarity: Rarity; remaining: number }>;
}> = ({ breakdown }) => {
  const total = breakdown.reduce((sum, entry) => sum + entry.remaining, 0);
  if (total === 0) return null;

  return (
    <span
      className={clsx(
        "flex h-1.5 w-full overflow-hidden rounded-full bg-muted",
      )}
      title={breakdown
        .map((entry) => `${entry.remaining} ${entry.rarity}`)
        .join(" · ")}
    >
      {breakdown.map((entry) => (
        <span
          key={entry.rarity}
          style={{
            width: `${(entry.remaining / total) * 100}%`,
            backgroundColor: rarityColor(entry.rarity),
          }}
        />
      ))}
    </span>
  );
};
