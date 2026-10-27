import type { Rarity } from "@dither-booth/shared/lottery";
import type { FC } from "react";

import { RARITY_TYPES } from "@dither-booth/shared/lottery";
import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import { Skeleton } from "@dither-booth/ui/components/ui/skeleton";
import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { addMinutes, format } from "date-fns";
import {
  ArrowRight,
  CalendarClock,
  CircleCheck,
  Dices,
  Gift,
  MonitorSmartphone,
  Printer,
  TriangleAlert,
} from "lucide-react";

import { rarityColor } from "#components/Misc/RarityBadge/index";

import type { CurrentEvent, EventPrize } from "../../Event.types";

import { formatEventTimes } from "../../event-times.utils";
import { getRarityBreakdown, getRemainingPrizes } from "../../Event.utils";
import { useOverviewSummary } from "../../hooks/useOverviewSummary";
import { formatDuration } from "../../lottery-odds.utils";
import {
  type AttentionItem,
  formatWhen,
  type OverviewSummary,
} from "../../overview.utils";
import { EventGuestsCard } from "../EventGuestsCard/index";

interface EventOverviewPanelProps {
  event: CurrentEvent;
  onOpenLottery: () => void;
  onOpenPrizes: () => void;
  onRestock: (prize: EventPrize) => void;
  onTurnOnLottery: () => Promise<void>;
  isTurningOnLottery: boolean;
  onEditDetails: () => void;
}

/**
 * The night at a glance. First what anyone may see (how it's going, the
 * numbers, the hours), then what only staff act on (what needs a look, the
 * lottery's controls). Editing lives elsewhere.
 */
export const EventOverviewPanel: FC<EventOverviewPanelProps> = ({
  event,
  onOpenLottery,
  onOpenPrizes,
  onRestock,
  onTurnOnLottery,
  isTurningOnLottery,
  onEditDetails,
}) => {
  const overview = useOverviewSummary(event);

  if (!overview) {
    return (
      <div
        aria-busy
        aria-label="Loading the overview"
        className={clsx("flex flex-col gap-4 md:gap-6")}
      >
        <Skeleton className={clsx("h-14 w-full max-w-xl")} />
        <Skeleton className={clsx("h-96 w-full rounded-xl")} />
      </div>
    );
  }

  const { stats, summary, isHealthKnown } = overview;

  return (
    <div className={clsx("flex flex-col gap-4 md:gap-6")}>
      <Headline
        headline={summary.headline}
        times={formatEventTimes(event.campaign)}
        firstVisitAt={stats.firstVisitAt}
        uncounted={stats.uncounted}
      />
      {stats.visits > 0 && (
        <EventGuestsCard
          shareable={summary.shareable}
          recentVisits={stats.recentVisits}
          hourly={stats.hourly}
        />
      )}
      <NeedsALookCard
        items={summary.attention}
        isHealthKnown={isHealthKnown}
        onEditDetails={onEditDetails}
        onRestock={(prizeId) => {
          const prize = event.prizes.find((entry) => entry.id === prizeId);
          if (prize) onRestock(prize);
        }}
      />
      <LotterySummaryCard
        event={event}
        lottery={summary.lottery}
        onOpen={onOpenLottery}
        onOpenPrizes={onOpenPrizes}
        onTurnOn={onTurnOnLottery}
        isTurningOn={isTurningOnLottery}
      />
    </div>
  );
};

/**
 * The event's start and end (or its first guest without them), one sentence
 * on how it's going, and the visits left uncounted.
 */
const Headline: FC<{
  headline: string;
  times: string | null;
  firstVisitAt: string | null;
  uncounted: number;
}> = ({ headline, times, firstVisitAt, uncounted }) => {
  const when =
    times ??
    (firstVisitAt && `First guest ${formatWhen(firstVisitAt, new Date())}`);

  return (
    <div className={clsx("flex flex-col gap-1")}>
      {when && <p className={clsx("text-sm text-muted-foreground")}>{when}</p>}
      <p className={clsx("text-lg font-medium text-balance")}>{headline}</p>
      {uncounted > 0 && (
        <p className={clsx("text-sm text-muted-foreground")}>
          {uncounted === 1
            ? "1 visit outside the event's start and end isn't counted."
            : `${uncounted} visits outside the event's start and end aren't counted.`}
        </p>
      )}
    </div>
  );
};

const ATTENTION_ICON = {
  "failed-print": Printer,
  booth: MonitorSmartphone,
  "prize-low": Gift,
  times: CalendarClock,
} as const;

/**
 * What staff should act on now, one row each with where to act. Staff
 * only: a client never sees this card.
 */
const NeedsALookCard: FC<{
  items: AttentionItem[];
  isHealthKnown: boolean;
  onRestock: (prizeId: string) => void;
  onEditDetails: () => void;
}> = ({ items, isHealthKnown, onRestock, onEditDetails }) => (
  <Card>
    <CardHeader>
      <CardTitle className={clsx("flex items-center gap-2.5")}>
        <IconBubble tone={items.length > 0 ? "amber" : "emerald"}>
          {items.length > 0 ? <TriangleAlert /> : <CircleCheck />}
        </IconBubble>
        Needs a look
      </CardTitle>
    </CardHeader>
    <CardContent>
      {items.length === 0 ? (
        <p className={clsx("text-sm text-muted-foreground")}>
          {isHealthKnown
            ? "Nothing right now. The screen, camera and printer are fine."
            : "Nothing right now."}
        </p>
      ) : (
        <ul className={clsx("flex flex-col divide-y")}>
          {items.map((item, index) => {
            const Icon = ATTENTION_ICON[item.kind];
            return (
              <li
                // Two tickets can fail in the same minute: same words.
                key={`${index}-${item.text}`}
                className={clsx(
                  "flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0",
                )}
              >
                <Icon
                  className={clsx("size-4 shrink-0 text-warning")}
                  aria-hidden
                />
                <span className={clsx("min-w-0 flex-1 text-sm")}>
                  {item.text}
                </span>
                {item.target === "details" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onEditDetails}
                  >
                    Set start and end
                  </Button>
                ) : item.target === "restock" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onRestock(item.prizeId)}
                  >
                    Restock
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    render={<Link to="/control-center" />}
                  >
                    Control center
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </CardContent>
  </Card>
);

/**
 * Where the lottery stands, in words: off and what that means, or the
 * prizes left by rarity, when they'll run out and the pause after a win.
 */
const LotterySummaryCard: FC<{
  event: CurrentEvent;
  lottery: OverviewSummary["lottery"];
  onOpen: () => void;
  onOpenPrizes: () => void;
  onTurnOn: () => Promise<void>;
  isTurningOn: boolean;
}> = ({ event, lottery, onOpen, onOpenPrizes, onTurnOn, isTurningOn }) => {
  const remainingPrizes = getRemainingPrizes(event);
  const breakdown = sortByRarity(getRarityBreakdown(event));
  const { enabled } = event.lottery;

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
        <div className={clsx("flex flex-col gap-2 text-sm")}>
          {!enabled ? (
            <p>Guests get their photo, with no prize draw.</p>
          ) : remainingPrizes === 0 ? (
            <p>No prizes left. Every draw is a loss until you restock.</p>
          ) : (
            <>
              <p>
                <span className={clsx("font-semibold tabular-nums")}>
                  {remainingPrizes}
                </span>{" "}
                {remainingPrizes === 1 ? "prize" : "prizes"} left:{" "}
                {breakdown
                  .map((entry) => `${entry.remaining} ${entry.rarity}`)
                  .join(", ")}
              </p>
              <RarityBar breakdown={breakdown} />
              <p className={clsx("text-muted-foreground")}>
                {lottery.isPaceMeasured
                  ? "At the booth's recent pace, "
                  : `At your estimate of ${lottery.guestsPerHour} guests an hour, `}
                {lottery.runsOutAfterMinutes === null
                  ? "they last more than 12 hours."
                  : `they last until about ${format(addMinutes(new Date(), lottery.runsOutAfterMinutes), "HH:mm")} (${formatDuration(lottery.runsOutAfterMinutes)}).`}
                {lottery.nextWinAt &&
                  ` Pause after a win: the next win can come at ${format(new Date(lottery.nextWinAt), "HH:mm")}.`}
              </p>
            </>
          )}
        </div>
        <div className={clsx("flex flex-wrap justify-end gap-2")}>
          {!enabled &&
            (remainingPrizes > 0 ? (
              <Button
                type="button"
                variant="outline"
                disabled={isTurningOn}
                onClick={() => void onTurnOn()}
              >
                Turn on
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={onOpenPrizes}>
                Add prizes
              </Button>
            ))}
          {enabled && remainingPrizes === 0 && (
            <Button type="button" variant="outline" onClick={onOpenPrizes}>
              Restock
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onOpen}>
            Lottery settings
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

type RarityCount = { rarity: Rarity; remaining: number };

const sortByRarity = (breakdown: RarityCount[]) =>
  [...breakdown].sort(
    (a, b) => RARITY_TYPES.indexOf(a.rarity) - RARITY_TYPES.indexOf(b.rarity),
  );

/** The prizes left by rarity as one segmented bar; the text above says it. */
const RarityBar: FC<{ breakdown: RarityCount[] }> = ({ breakdown }) => {
  const total = breakdown.reduce((sum, entry) => sum + entry.remaining, 0);

  return (
    <span
      aria-hidden
      className={clsx(
        "flex h-1.5 w-full overflow-hidden rounded-full bg-muted",
      )}
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
