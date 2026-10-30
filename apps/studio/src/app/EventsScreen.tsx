import { Button } from "@dither-booth/ui/components/ui/button";
import { Card, CardContent } from "@dither-booth/ui/components/ui/card";
import clsx from "clsx";
import { ChevronRight, Plus } from "lucide-react";
import { useState } from "react";

import { EventForm } from "#app/EventForm";
import { LiveFallback } from "#app/LiveFallback";
import { OnCallBadge } from "#app/OnCallSection";
import {
  eventPhase,
  type EventPhase,
  eventPlace,
  type EventRow,
  eventWindow,
  listEvents,
} from "#lib/events";
import { useLive } from "#lib/live";

const GROUPS: { phase: EventPhase; title: string }[] = [
  { phase: "live", title: "On now" },
  { phase: "upcoming", title: "Coming up" },
  { phase: "past", title: "Past" },
];

/** How many past events the list keeps, newest first. */
const PAST_SHOWN = 10;

const EventLine = ({
  event,
  onOpen,
}: {
  event: EventRow;
  onOpen: () => void;
}) => (
  <li>
    <button
      type="button"
      onClick={onOpen}
      className={clsx(
        "flex w-full items-center gap-3 py-3 text-left",
        "focus-visible:outline-2 focus-visible:outline-ring",
      )}
    >
      <div className={clsx("flex min-w-0 flex-1 flex-col gap-1")}>
        <p className={clsx("truncate text-sm font-medium")}>{event.name}</p>
        <p className={clsx("text-xs text-muted-foreground")}>
          {eventWindow(event)}
        </p>
        <p className={clsx("truncate text-xs text-muted-foreground")}>
          {eventPlace(event)}
        </p>
      </div>
      {/* Only the booth's team sees who is on call. */}
      {event.boothTeamId !== null ? (
        <OnCallBadge onCall={event.onCall} />
      ) : null}
      <ChevronRight
        aria-hidden
        className={clsx("size-4 shrink-0 text-muted-foreground")}
      />
    </button>
  </li>
);

/**
 * Studio's Events: what each booth is booked for, on now, coming up and
 * past. Platform admins book them; the client's team and the booth's team
 * read them.
 */
export const EventsScreen = ({
  isAdmin,
  onOpen,
}: {
  isAdmin: boolean;
  onOpen: (eventId: string) => void;
}) => {
  const live = useLive("events", listEvents, ["event", "event_on_call"]);
  const [booking, setBooking] = useState(false);

  if (live.data === undefined) {
    return <LiveFallback error={live.error} what="events" />;
  }

  const now = Date.now();
  const byPhase = (phase: EventPhase) => {
    const events = live.data!.filter(
      (event) => eventPhase(event, now) === phase,
    );
    return phase === "past" ? events.reverse().slice(0, PAST_SHOWN) : events;
  };

  return (
    <div className={clsx("flex flex-col gap-4")}>
      {isAdmin ? (
        booking ? (
          <EventForm
            onDone={(saved) => {
              setBooking(false);
              if (saved) live.reload();
            }}
          />
        ) : (
          <Button
            type="button"
            className={clsx("self-start")}
            onClick={() => setBooking(true)}
          >
            <Plus data-icon="inline-start" />
            Book an event
          </Button>
        )
      ) : null}

      {live.data.length === 0 ? (
        <p className={clsx("text-sm text-muted-foreground")}>
          {isAdmin
            ? "No events yet. Book the next one: its booth is then expected to report, and you pick who's on call."
            : "No events yet. A platform admin books them."}
        </p>
      ) : null}

      {GROUPS.map(({ phase, title }) => {
        const events = byPhase(phase);
        if (events.length === 0) return null;
        return (
          <section
            key={phase}
            aria-label={title}
            className={clsx("flex flex-col gap-2")}
          >
            <h3 className={clsx("text-sm font-medium text-muted-foreground")}>
              {title}
            </h3>
            <Card>
              <CardContent>
                <ul className={clsx("-my-3 divide-y divide-border")}>
                  {events.map((event) => (
                    <EventLine
                      key={event.id}
                      event={event}
                      onOpen={() => onOpen(event.id)}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>
        );
      })}
    </div>
  );
};
