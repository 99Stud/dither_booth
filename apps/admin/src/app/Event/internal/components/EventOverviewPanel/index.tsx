import type { FC } from "react";

import { capitalize } from "@dither-booth/shared/formatting";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import { TextField } from "@dither-booth/ui/fields/TextField";
import { useForm } from "@tanstack/react-form";
import clsx from "clsx";
import { useEffect } from "react";

import { StatusDot } from "#components/Misc/StatusDot/index";

import type { CurrentEvent } from "../../Event.types";

import {
  UPDATE_EVENT_NAME_FORM_SCHEMA,
  getUpdateEventNameFormValues,
} from "../../Event.constants";
import { getRarityBreakdown, getRemainingPrizes } from "../../Event.utils";
import { EventTicketItemsCard } from "../EventTicketItemsCard/index";

interface EventOverviewPanelProps {
  event: CurrentEvent;
  isSavingName: boolean;
  isSavingTicketItems: boolean;
  onSaveName: (name: string) => Promise<void>;
  onSaveTicketItems: (names: string[]) => Promise<void>;
  onReplaceClick: () => void;
}

export const EventOverviewPanel: FC<EventOverviewPanelProps> = (props) => {
  const {
    event,
    isSavingName,
    isSavingTicketItems,
    onSaveName,
    onSaveTicketItems,
    onReplaceClick,
  } = props;
  const remainingPrizes = getRemainingPrizes(event);
  const rarityBreakdown = getRarityBreakdown(event);

  const form = useForm({
    defaultValues: getUpdateEventNameFormValues(event),
    validators: {
      onChange: UPDATE_EVENT_NAME_FORM_SCHEMA,
      onSubmit: UPDATE_EVENT_NAME_FORM_SCHEMA,
    },
    onSubmit: async ({ value }) => {
      await onSaveName(value.name);
    },
  });

  useEffect(() => {
    form.reset(getUpdateEventNameFormValues(event));
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- sync on server identity only
  }, [event.campaign.name, event.campaign.id]);

  return (
    <div className={clsx("grid gap-4 md:grid-cols-2")}>
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription></CardDescription>
        </CardHeader>
        <CardContent className={clsx("flex flex-col gap-4")}>
          <div className={clsx("flex flex-wrap items-center gap-2")}>
            <span className={clsx("inline-flex items-center gap-2", "text-sm")}>
              <StatusDot
                size="md"
                variant={event.lottery.enabled ? "success" : "neutral"}
              />
              {event.lottery.enabled ? "Lottery live" : "Lottery off"}
            </span>
            <span className={clsx("text-muted-foreground")}>
              {remainingPrizes} remaining prizes
            </span>
          </div>
          {rarityBreakdown.length > 0 && (
            <ul className={clsx("flex flex-col gap-1")}>
              {rarityBreakdown.map((entry) => (
                <li key={entry.rarity} className={clsx("text-sm")}>
                  <span className={clsx("font-medium")}>
                    {entry.remaining}x
                  </span>{" "}
                  {capitalize(entry.rarity)}
                </li>
              ))}
            </ul>
          )}
          <form
            className={clsx("flex flex-col gap-3")}
            onSubmit={(submitEvent) => {
              submitEvent.preventDefault();
              submitEvent.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <TextField form={form} name="name" label="Event name" />
            <div className={clsx("flex gap-2")}>
              <Button type="submit" disabled={isSavingName}>
                Save name
              </Button>
              <Button type="button" variant="outline" onClick={onReplaceClick}>
                Replace event
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Lottery snapshot</CardTitle>
          <CardDescription>
            Odds and cooldown are edited in the Lottery tab. Prize stock is
            managed under Prizes.
          </CardDescription>
        </CardHeader>
        <CardContent className={clsx("flex flex-col gap-2 text-sm")}>
          <p>
            No-win weight:{" "}
            <span className={clsx("font-medium")}>
              {event.lottery.noWinWeight}
            </span>
          </p>
          <p>
            Win cooldown:{" "}
            <span className={clsx("font-medium")}>
              {event.lottery.winCooldownMinutes} min
            </span>
          </p>
          <p>
            Print loser ticket:{" "}
            <span className={clsx("font-medium")}>
              {event.lottery.printLoserTicket ? "Yes" : "No"}
            </span>
          </p>
          <p>
            Prizes configured:{" "}
            <span className={clsx("font-medium")}>{event.prizes.length}</span>
          </p>
        </CardContent>
      </Card>
      <EventTicketItemsCard
        event={event}
        isSaving={isSavingTicketItems}
        onSave={onSaveTicketItems}
      />
    </div>
  );
};
