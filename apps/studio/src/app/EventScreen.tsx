import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@dither-booth/ui/components/ui/alert-dialog";
import { Badge } from "@dither-booth/ui/components/ui/badge";
import { Button } from "@dither-booth/ui/components/ui/button";
import clsx from "clsx";
import {
  ArrowLeft,
  CalendarClock,
  Pencil,
  Printer,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EventForm } from "#app/EventForm";
import { LiveFallback } from "#app/LiveFallback";
import { OnCallSection } from "#app/OnCallSection";
import { messageOf } from "#lib/errors";
import {
  deleteEvent,
  eventPhase,
  eventPlace,
  type EventRow,
  eventWindow,
  listEvents,
} from "#lib/events";
import { useLive } from "#lib/live";

const PHASE_BADGE = {
  live: { label: "On now", variant: "default" },
  upcoming: { label: "Coming up", variant: "outline" },
  past: { label: "Over", variant: "outline" },
} as const;

const CancelEvent = ({
  event,
  onCancelled,
}: {
  event: EventRow;
  onCancelled: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    setBusy(true);
    try {
      await deleteEvent(event.id);
      toast.success(`${event.name} cancelled.`);
      onCancelled();
    } catch (error) {
      toast.error(`Couldn't cancel ${event.name}: ${messageOf(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        <Trash2 data-icon="inline-start" />
        Cancel event
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {event.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {event.boothName ?? "The booth"} is no longer expected at it, and
              nobody stays on call for it. You can book it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setOpen(false);
                void cancel();
              }}
            >
              Cancel event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

/**
 * One event: when and where, and who is on call for it. Platform admins
 * change or cancel it here.
 */
export const EventScreen = ({
  eventId,
  isAdmin,
  onBack,
  onOpenTeam,
}: {
  eventId: string;
  isAdmin: boolean;
  onBack: () => void;
  onOpenTeam: () => void;
}) => {
  const live = useLive("events", listEvents, ["event", "event_on_call"]);
  const [editing, setEditing] = useState(false);

  const back = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={clsx("self-start")}
      onClick={onBack}
    >
      <ArrowLeft data-icon="inline-start" />
      Events
    </Button>
  );

  if (live.data === undefined) {
    return (
      <div className={clsx("flex flex-col gap-4")}>
        {back}
        <LiveFallback error={live.error} what="event" />
      </div>
    );
  }

  const event = live.data.find((candidate) => candidate.id === eventId);
  if (!event) {
    return (
      <div className={clsx("flex flex-col gap-4")}>
        {back}
        <p className={clsx("text-sm")}>
          This event isn't on the Hub anymore: it was cancelled, or it isn't one
          of your team's.
        </p>
      </div>
    );
  }

  const phase = PHASE_BADGE[eventPhase(event, Date.now())];

  return (
    <div className={clsx("flex flex-col gap-6")}>
      <div className={clsx("flex flex-col gap-3")}>
        {back}
        {editing ? (
          <EventForm
            event={event}
            onDone={(saved) => {
              setEditing(false);
              if (saved) live.reload();
            }}
          />
        ) : (
          <>
            <div className={clsx("flex items-start justify-between gap-3")}>
              <p className={clsx("text-lg font-semibold")}>{event.name}</p>
              <Badge variant={phase.variant}>{phase.label}</Badge>
            </div>
            <p className={clsx("flex items-start gap-2 text-sm")}>
              <CalendarClock
                aria-hidden
                className={clsx("mt-0.5 size-4 shrink-0 text-muted-foreground")}
              />
              {eventWindow(event)}
            </p>
            <p className={clsx("flex items-start gap-2 text-sm")}>
              <Printer
                aria-hidden
                className={clsx("mt-0.5 size-4 shrink-0 text-muted-foreground")}
              />
              {eventPlace(event) || "A booth of another team"}
            </p>
            {isAdmin ? (
              <div className={clsx("flex flex-wrap gap-2")}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(true)}
                >
                  <Pencil data-icon="inline-start" />
                  Change
                </Button>
                <CancelEvent event={event} onCancelled={onBack} />
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* The client's team sees its event, not who runs the booth. */}
      {event.boothTeamId !== null || isAdmin ? (
        <OnCallSection
          key={event.id}
          eventId={event.id}
          canChange={isAdmin}
          onOpenTeam={onOpenTeam}
        />
      ) : null}
    </div>
  );
};
