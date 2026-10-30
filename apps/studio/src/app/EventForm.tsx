import type { FormEvent } from "react";

import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@dither-booth/ui/components/ui/field";
import { Input } from "@dither-booth/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dither-booth/ui/components/ui/select";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  bookableBooths,
  type EventDraft,
  eventErrorMessage,
  type EventRow,
  saveEvent,
} from "#lib/events";
import { type Team, visibleTeams } from "#lib/team";
import { toLocalInput } from "#lib/time";

type Booth = Awaited<ReturnType<typeof bookableBooths>>[number];

/** A listbox of named options (Base UI's, not a native one). */
const Picker = ({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) => (
  // ds-allow-native-select
  <Select
    items={options}
    value={value || null}
    onValueChange={(next) => {
      if (next) onChange(next as string);
    }}
  >
    <SelectTrigger id={id} aria-label={label} className={clsx("w-full")}>
      <SelectValue placeholder="Choose…" />
    </SelectTrigger>
    <SelectContent>
      {options.map((option) => (
        <SelectItem key={option.value} value={option.value}>
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

/**
 * Books an event, or changes one: its name, booth and window. The client
 * is picked once: an event booked for the wrong one is cancelled and booked
 * again.
 */
export const EventForm = ({
  event,
  onDone,
}: {
  event?: EventRow;
  onDone: (saved: boolean) => void;
}) => {
  const [teams, setTeams] = useState<Team[]>();
  const [booths, setBooths] = useState<Booth[]>();
  const [name, setName] = useState(event?.name ?? "");
  const [clientId, setClientId] = useState(event?.clientId ?? "");
  const [boothId, setBoothId] = useState(event?.boothId ?? "");
  const [from, setFrom] = useState(toLocalInput(event?.startsAt ?? null));
  const [until, setUntil] = useState(toLocalInput(event?.endsAt ?? null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    Promise.all([visibleTeams(), bookableBooths()]).then(
      ([nextTeams, nextBooths]) => {
        setTeams(nextTeams);
        setBooths(nextBooths);
      },
      () =>
        setError("Couldn't load the teams and booths. Check the connection."),
    );
  }, []);

  const teamName = new Map((teams ?? []).map((team) => [team.id, team.name]));
  const severalTeams = new Set((booths ?? []).map((b) => b.teamId)).size > 1;
  const boothLabel = (booth: Booth) =>
    severalTeams
      ? `${booth.name} (${teamName.get(booth.teamId) ?? "another team"})`
      : booth.name;
  const ready =
    name.trim() !== "" &&
    clientId !== "" &&
    boothId !== "" &&
    from !== "" &&
    until !== "" &&
    until > from;

  const submit = async (submitted: FormEvent) => {
    submitted.preventDefault();
    if (!ready) return;
    const draft: EventDraft = {
      clientId,
      boothId,
      name,
      startsAt: new Date(from).toISOString(),
      endsAt: new Date(until).toISOString(),
    };
    const booth = booths?.find((candidate) => candidate.id === boothId);
    setBusy(true);
    setError(undefined);
    try {
      await saveEvent(draft, event?.id);
      toast.success(
        event ? `${draft.name.trim()} saved.` : `${draft.name.trim()} booked.`,
      );
      onDone(true);
    } catch (caught) {
      setError(eventErrorMessage(caught, draft, booth?.name ?? "The booth"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className={clsx(
        "flex flex-col gap-3 rounded-lg border border-border p-3",
      )}
      onSubmit={submit}
      noValidate
    >
      <p className={clsx("text-sm font-medium")}>
        {event ? `Change ${event.name}` : "Book an event"}
      </p>
      <Field>
        <FieldLabel htmlFor="event-name">Name</FieldLabel>
        <Input
          id="event-name"
          placeholder="Halloween at Le Bar"
          maxLength={120}
          value={name}
          onChange={(changed) => {
            setName(changed.target.value);
            setError(undefined);
          }}
        />
      </Field>
      {event ? (
        <p className={clsx("text-sm text-muted-foreground")}>
          For {event.clientName ?? "its client"}.
        </p>
      ) : (
        <Field>
          <FieldLabel htmlFor="event-client">Client</FieldLabel>
          <Picker
            id="event-client"
            label="Client"
            options={(teams ?? []).map((team) => ({
              value: team.id,
              label: team.name,
            }))}
            value={clientId}
            onChange={(next) => {
              setClientId(next);
              setError(undefined);
            }}
          />
          <FieldDescription>
            The team whose event it is. A new client starts in Team, with New
            team.
          </FieldDescription>
        </Field>
      )}
      <Field>
        <FieldLabel htmlFor="event-booth">Booth</FieldLabel>
        <Picker
          id="event-booth"
          label="Booth"
          options={(booths ?? []).map((booth) => ({
            value: booth.id,
            label: boothLabel(booth),
          }))}
          value={boothId}
          onChange={(next) => {
            setBoothId(next);
            setError(undefined);
          }}
        />
      </Field>
      <div className={clsx("grid gap-3 sm:grid-cols-2")}>
        <Field>
          <FieldLabel htmlFor="event-starts">Starts</FieldLabel>
          <Input
            id="event-starts"
            type="datetime-local"
            required
            value={from}
            onChange={(changed) => {
              setFrom(changed.target.value);
              setError(undefined);
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="event-ends">Ends</FieldLabel>
          <Input
            id="event-ends"
            type="datetime-local"
            required
            min={from}
            value={until}
            onChange={(changed) => {
              setUntil(changed.target.value);
              setError(undefined);
            }}
          />
        </Field>
      </div>
      <Field data-invalid={error ? true : undefined}>
        <FieldError>{error}</FieldError>
      </Field>
      <div className={clsx("flex flex-wrap justify-end gap-2")}>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => onDone(false)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !ready}>
          {busy ? <Spinner className="size-4" /> : null}
          {event ? "Save changes" : "Book event"}
        </Button>
      </div>
    </form>
  );
};
