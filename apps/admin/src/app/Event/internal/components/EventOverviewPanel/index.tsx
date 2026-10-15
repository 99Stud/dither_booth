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
import { SelectField } from "@dither-booth/ui/fields/SelectField";
import { TextField } from "@dither-booth/ui/fields/TextField";
import { useForm } from "@tanstack/react-form";
import clsx from "clsx";
import {
  CalendarDays,
  Dices,
  Gift,
  Package,
  RefreshCw,
  Save,
  Timer,
} from "lucide-react";
import { useEffect } from "react";

import type { CurrentEvent, UpdateEventFormValues } from "../../Event.types";

import {
  KIT_FIELD_OPTIONS,
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
  }, [event.campaign.name, event.campaign.kitId, event.campaign.id]);

  return (
    <div className={clsx("flex flex-col gap-4 md:gap-6")}>
      <Card size="sm" className={clsx("py-0")}>
        {/* 1px gaps over the border colour draw the dividers, in 2×2 on
            phones and one row on desktop. */}
        <div
          className={clsx(
            "grid grid-cols-2 gap-px bg-border lg:grid-cols-4",
            "[&>*]:bg-card",
          )}
        >
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
        </div>
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
              <TextField form={form} name="name" label="Event name" />
              <SelectField
                form={form}
                name="kitId"
                label="Ticket kit"
                placeholder="Select a ticket kit"
                options={KIT_FIELD_OPTIONS}
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

const RARITY_BAR_COLORS = {
  common: "bg-zinc-400 dark:bg-zinc-500",
  uncommon: "bg-emerald-500",
  rare: "bg-sky-500",
  epic: "bg-violet-500",
  legendary: "bg-amber-400",
} as const satisfies Record<Rarity, string>;

/** The prizes left by rarity, as one small segmented bar (hover for counts). */
const RarityBar: FC<{
  breakdown: Array<{ rarity: Rarity; remaining: number }>;
}> = ({ breakdown }) => {
  const total = breakdown.reduce((sum, entry) => sum + entry.remaining, 0);
  if (total === 0) return null;

  return (
    <span
      className={clsx(
        "flex h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:w-20",
      )}
      title={breakdown
        .map((entry) => `${entry.remaining} ${entry.rarity}`)
        .join(" · ")}
    >
      {breakdown.map((entry) => (
        <span
          key={entry.rarity}
          className={clsx(RARITY_BAR_COLORS[entry.rarity])}
          style={{ width: `${(entry.remaining / total) * 100}%` }}
        />
      ))}
    </span>
  );
};
