import type { FC, PropsWithChildren, ReactNode } from "react";

import { Badge } from "@dither-booth/ui/components/ui/badge";
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

import { RarityBadge } from "#components/Misc/RarityBadge/index";

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
      <div className={clsx("grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4")}>
        <StatTile icon={<Dices />} label="Lottery">
          {event.lottery.enabled ? (
            <Badge
              className={clsx("bg-success/10 text-success dark:bg-success/15")}
              variant="secondary"
            >
              <span className={clsx("size-1.5 rounded-full bg-success")} />
              Live
            </Badge>
          ) : (
            <Badge variant="outline">Off</Badge>
          )}
        </StatTile>
        <StatTile
          icon={<Gift />}
          label="Prizes left"
          footer={
            rarityBreakdown.length > 0 && (
              <div className={clsx("flex flex-wrap gap-1.5")}>
                {rarityBreakdown.map((entry) => (
                  <RarityBadge
                    key={entry.rarity}
                    count={entry.remaining}
                    rarity={entry.rarity}
                  />
                ))}
              </div>
            )
          }
        >
          {remainingPrizes}
        </StatTile>
        <StatTile icon={<Package />} label="Prizes">
          {event.prizes.length}
        </StatTile>
        <StatTile icon={<Timer />} label="Win cooldown">
          {event.lottery.winCooldownMinutes}
          <span className={clsx("ml-1 text-sm text-muted-foreground")}>
            min
          </span>
        </StatTile>
      </div>

      <div className={clsx("grid items-start gap-4 md:gap-6 lg:grid-cols-2")}>
        <Card>
          <CardHeader>
            <CardTitle className={clsx("flex items-center gap-2")}>
              <CalendarDays className={clsx("size-4 text-muted-foreground")} />
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

/** A KPI tile, as on Vercel's and Stripe's dashboards. */
const StatTile: FC<
  PropsWithChildren<{ label: string; icon: ReactNode; footer?: ReactNode }>
> = ({ label, icon, footer, children }) => (
  <Card size="sm">
    <CardContent className={clsx("flex flex-col gap-1.5")}>
      <span
        className={clsx(
          "flex items-center justify-between gap-2",
          "text-xs font-medium text-muted-foreground",
          "[&_svg]:size-4",
        )}
      >
        {label}
        {icon}
      </span>
      <span
        className={clsx(
          "flex min-h-8 items-center text-2xl font-semibold tabular-nums",
        )}
      >
        {children}
      </span>
      {footer}
    </CardContent>
  </Card>
);
