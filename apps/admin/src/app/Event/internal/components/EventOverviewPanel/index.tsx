import type { Rarity } from "@dither-booth/shared/lottery";
import type { FC, PropsWithChildren, ReactNode } from "react";

import {
  IconBubble,
  type IconBubbleTone,
} from "@dither-booth/ui/components/misc/IconBubble";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import { TextField } from "@dither-booth/ui/fields/TextField";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  CalendarDays,
  Clock,
  Dices,
  Gift,
  Package,
  Printer,
  RefreshCw,
  Save,
  Timer,
  Trophy,
  Users,
} from "lucide-react";
import { useEffect } from "react";

import { rarityColor } from "#components/Misc/RarityBadge/index";
import { useTRPC } from "#lib/trpc/trpc.client";

import type { CurrentEvent, UpdateEventFormValues } from "../../Event.types";

import {
  UPDATE_EVENT_FORM_SCHEMA,
  getUpdateEventFormValues,
} from "../../Event.constants";
import { getRarityBreakdown, getRemainingPrizes } from "../../Event.utils";
import { EventTicketItemsCard } from "../EventTicketItemsCard/index";

interface EventOverviewPanelProps {
  event: CurrentEvent;
  isSavingDetails: boolean;
  isSavingTicketItems: boolean;
  onSaveDetails: (values: UpdateEventFormValues) => Promise<void>;
  onSaveTicketItems: (names: string[]) => Promise<void>;
  onReplaceClick: () => void;
}

export const EventOverviewPanel: FC<EventOverviewPanelProps> = (props) => {
  const {
    event,
    isSavingDetails,
    isSavingTicketItems,
    onSaveDetails,
    onSaveTicketItems,
    onReplaceClick,
  } = props;
  const remainingPrizes = getRemainingPrizes(event);
  const rarityBreakdown = getRarityBreakdown(event);

  const form = useForm({
    defaultValues: getUpdateEventFormValues(event),
    validators: {
      onChange: UPDATE_EVENT_FORM_SCHEMA,
      onSubmit: UPDATE_EVENT_FORM_SCHEMA,
    },
    onSubmit: async ({ value }) => {
      await onSaveDetails(value);
    },
  });

  useEffect(() => {
    form.reset(getUpdateEventFormValues(event));
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- sync on server identity only
  }, [event.campaign.name, event.campaign.id]);

  return (
    <div className={clsx("flex flex-col gap-4 md:gap-6")}>
      <VisitStats />
      <Card size="sm" className={clsx("py-0")}>
        <StatStrip>
          <Stat icon={<Dices />} tone="violet" label="Lottery">
            {event.lottery.enabled ? (
              <span className={clsx("inline-flex items-center gap-1.5")}>
                <span className={clsx("relative flex size-2")}>
                  <span
                    className={clsx(
                      "absolute inline-flex size-full animate-ping rounded-full bg-success/60",
                    )}
                  />
                  <span
                    className={clsx(
                      "relative inline-flex size-2 rounded-full bg-success",
                    )}
                  />
                </span>
                Live
              </span>
            ) : (
              <span className={clsx("text-muted-foreground")}>Off</span>
            )}
          </Stat>
          <Stat icon={<Gift />} tone="rose" label="Prizes left">
            <span className={clsx("flex items-center gap-3")}>
              {remainingPrizes}
              <RarityBar breakdown={rarityBreakdown} />
            </span>
          </Stat>
          <Stat icon={<Package />} tone="amber" label="Prizes">
            {event.prizes.length}
          </Stat>
          <Stat icon={<Timer />} tone="sky" label="Win cooldown">
            {event.lottery.winCooldownMinutes}
            <span
              className={clsx("ml-1 text-sm font-normal text-muted-foreground")}
            >
              min
            </span>
          </Stat>
        </StatStrip>
      </Card>

      <div className={clsx("grid items-start gap-4 md:gap-6 lg:grid-cols-2")}>
        <Card>
          <CardHeader>
            <CardTitle className={clsx("flex items-center gap-2.5")}>
              <IconBubble tone="sky">
                <CalendarDays />
              </IconBubble>
              Event details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className={clsx("flex flex-col gap-4")}
              onSubmit={(submitEvent) => {
                submitEvent.preventDefault();
                submitEvent.stopPropagation();
                void form.handleSubmit();
              }}
            >
              <TextField
                form={form}
                name="name"
                label="Event name"
                autoCapitalize="words"
                enterKeyHint="done"
              />
              <div className={clsx("flex flex-wrap justify-end gap-2")}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onReplaceClick}
                >
                  <RefreshCw data-icon="inline-start" />
                  Replace event
                </Button>
                <Button type="submit" disabled={isSavingDetails}>
                  <Save data-icon="inline-start" />
                  Save
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <EventTicketItemsCard
          event={event}
          isSaving={isSavingTicketItems}
          onSave={onSaveTicketItems}
        />
      </div>
    </div>
  );
};

/** How often the visit tiles refresh, so they follow the night live. */
const VISIT_STATS_POLL_MS = 10_000;

/** `65` → `1:05`. */
const formatMinutesSeconds = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** The event's guests so far, counted from the booth's visits. */
const VisitStats: FC = () => {
  const trpc = useTRPC();
  const { data: stats } = useQuery({
    ...trpc.config.getVisitStats.queryOptions(),
    refetchInterval: VISIT_STATS_POLL_MS,
  });
  if (!stats) return null;

  return (
    <Card size="sm" className={clsx("py-0")}>
      <StatStrip>
        <Stat icon={<Users />} tone="emerald" label="Visits">
          {stats.visits}
          <span
            className={clsx("ml-1.5 text-sm font-normal text-muted-foreground")}
          >
            {stats.completed} completed
          </span>
        </Stat>
        <Stat icon={<Printer />} tone="violet" label="Prints">
          {stats.prints}
        </Stat>
        <Stat icon={<Trophy />} tone="rose" label="Wins">
          {stats.wins}
        </Stat>
        <Stat icon={<Clock />} tone="amber" label="Average visit">
          {stats.avgDurationS === null ? (
            <span className={clsx("text-muted-foreground")}>–</span>
          ) : (
            formatMinutesSeconds(stats.avgDurationS)
          )}
        </Stat>
      </StatStrip>
    </Card>
  );
};

/**
 * Four stats in one card. 1px gaps over the border colour draw the
 * dividers, in 2×2 on phones and one row on desktop.
 */
const StatStrip: FC<PropsWithChildren> = ({ children }) => (
  <div
    className={clsx(
      "grid grid-cols-2 gap-px bg-border lg:grid-cols-4",
      "[&>*]:bg-card",
    )}
  >
    {children}
  </div>
);

/**
 * One stat of the strip: a tinted icon, a small label and the value, on a
 * single compact row. The strip groups them in one card, split by
 * dividers, rather than one big card per number.
 */
const Stat: FC<
  PropsWithChildren<{ label: string; icon: ReactNode; tone: IconBubbleTone }>
> = ({ label, icon, tone, children }) => (
  <div className={clsx("flex items-center gap-3 px-4 py-3")}>
    <IconBubble size="md" tone={tone}>
      {icon}
    </IconBubble>
    <div className={clsx("min-w-0")}>
      <div className={clsx("text-xs text-muted-foreground")}>{label}</div>
      <div
        className={clsx(
          "flex items-center text-lg leading-tight font-semibold tabular-nums",
        )}
      >
        {children}
      </div>
    </div>
  </div>
);

/** The prizes left by rarity, as one small segmented bar (hover for counts). */
const RarityBar: FC<{
  breakdown: Array<{ rarity: Rarity; remaining: number }>;
}> = ({ breakdown }) => {
  const total = breakdown.reduce((sum, entry) => sum + entry.remaining, 0);
  if (total === 0) return null;

  return (
    <span
      className={clsx(
        "hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:flex",
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
