import { format } from "date-fns";

import { messageOf, postgresCode } from "./errors";
import { hub } from "./hub";

/**
 * An event as Studio lists it: a client, a booth, a window, a name. Names
 * the reader may not see come back null: the client's team doesn't read
 * the booth's team, nor the other way round.
 */
export type EventRow = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  clientId: string;
  clientName: string | null;
  boothId: string;
  boothName: string | null;
  /** The booth's team, when the reader sees the booth. */
  boothTeamId: string | null;
  /** How many are on call; 0 for a reader who doesn't see who is. */
  onCall: number;
};

export type EventPhase = "live" | "upcoming" | "past";

/** On while its window covers now; the window is half-open, as on the Hub. */
export function eventPhase(
  event: Pick<EventRow, "startsAt" | "endsAt">,
  now: number,
): EventPhase {
  if (now < new Date(event.startsAt).getTime()) return "upcoming";
  if (now < new Date(event.endsAt).getTime()) return "live";
  return "past";
}

/** "Sat 31 Oct, 18:00 to 02:00", or with both dates when it spans more. */
export function eventWindow(event: Pick<EventRow, "startsAt" | "endsAt">) {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const sameNight = end.getTime() - start.getTime() < 24 * 3_600_000;
  return sameNight
    ? `${format(start, "EEE d MMM, HH:mm")} to ${format(end, "HH:mm")}`
    : `${format(start, "EEE d MMM, HH:mm")} to ${format(end, "EEE d MMM, HH:mm")}`;
}

/** Where and for whom, as far as the reader may see. */
export const eventPlace = (event: Pick<EventRow, "boothName" | "clientName">) =>
  [event.boothName, event.clientName && `for ${event.clientName}`]
    .filter(Boolean)
    .join(" ");

/** The label on an event's row: who gets its alerts. */
export const onCallBadge = (onCall: number) =>
  onCall > 0 ? `${onCall} on call` : "Whole team";

/**
 * Every event the signed-in user sees, soonest first. Read table by table:
 * event_on_call joins event and booth, so embedding the booth is ambiguous.
 */
export async function listEvents(): Promise<EventRow[]> {
  const [events, booths, teams, onCall] = await Promise.all([
    hub
      .from("event")
      .select("id, name, starts_at, ends_at, org_id, booth_id")
      .order("starts_at"),
    hub.from("booth").select("id, name, org_id"),
    hub.from("org").select("id, name"),
    hub.from("event_on_call").select("event_id"),
  ]);
  if (events.error) throw events.error;
  if (booths.error) throw booths.error;
  if (teams.error) throw teams.error;
  if (onCall.error) throw onCall.error;
  const boothById = new Map((booths.data ?? []).map((row) => [row.id, row]));
  const teamName = new Map((teams.data ?? []).map((row) => [row.id, row.name]));
  const counts = new Map<string, number>();
  for (const { event_id } of onCall.data ?? []) {
    counts.set(event_id, (counts.get(event_id) ?? 0) + 1);
  }
  return (events.data ?? []).map((event) => {
    const booth = boothById.get(event.booth_id);
    return {
      id: event.id,
      name: event.name,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      clientId: event.org_id,
      clientName: teamName.get(event.org_id) ?? null,
      boothId: event.booth_id,
      boothName: booth?.name ?? null,
      boothTeamId: booth?.org_id ?? null,
      onCall: counts.get(event.id) ?? 0,
    };
  });
}

/** What an admin books or changes. The client of a booked event stays. */
export type EventDraft = {
  clientId: string;
  boothId: string;
  name: string;
  startsAt: string;
  endsAt: string;
};

/** Postgres' codes for what the Hub refuses, read once here. */
const OVERLAP = "23P01";
const MOVED_ACROSS_TEAMS = "23503";
const CHECK_FAILED = "23514";
const NOT_ALLOWED = "42501";

/** The booth already has another event then: found before saving. */
export class EventClash extends Error {
  constructor(readonly other: string) {
    super(`The booth already has ${other} then.`);
  }
}

/** The event already on the booth then, if any. */
async function clashingName(
  draft: EventDraft,
  except?: string,
): Promise<string | null> {
  let query = hub
    .from("event")
    .select("id, name")
    .eq("booth_id", draft.boothId)
    .lt("starts_at", draft.endsAt)
    .gt("ends_at", draft.startsAt);
  if (except) query = query.neq("id", except);
  const { data } = await query.limit(1);
  return data?.[0]?.name ?? null;
}

/** The words for a refused booking or change, with the Hub's reason. */
export function eventErrorMessage(
  error: unknown,
  draft: EventDraft,
  boothName: string,
): string {
  if (error instanceof EventClash) {
    return `${boothName} already has ${error.other} then. Pick another booth or time.`;
  }
  const code = postgresCode(error);
  // The Hub's own refusal, when another booking landed in between.
  if (code === OVERLAP) {
    return `${boothName} already has an event then. Pick another booth or time.`;
  }
  if (code === MOVED_ACROSS_TEAMS) {
    return `Can't move ${draft.name} to ${boothName}: its on-call staff are in another team. Take them off call first.`;
  }
  if (code === CHECK_FAILED) {
    return "Check the name (120 characters at most) and that it ends after it starts.";
  }
  if (code === NOT_ALLOWED) return "Only platform admins book events.";
  return `Couldn't save ${draft.name}: ${messageOf(error, "the Hub didn't answer")}. Check your connection and try again.`;
}

/**
 * Books an event; with an id, changes it. A clash is checked first, to name
 * the event already there; the Hub's exclusion constraint stays the backstop.
 */
export async function saveEvent(draft: EventDraft, id?: string) {
  const other = await clashingName(draft, id);
  if (other) throw new EventClash(other);
  const fields = {
    booth_id: draft.boothId,
    name: draft.name.trim(),
    starts_at: draft.startsAt,
    ends_at: draft.endsAt,
  };
  const { error } = id
    ? await hub.from("event").update(fields).eq("id", id)
    : await hub.from("event").insert({ ...fields, org_id: draft.clientId });
  if (error) throw error;
}

/** Cancels an event: it's gone, and so is who was on call. */
export async function deleteEvent(id: string) {
  const { error } = await hub.from("event").delete().eq("id", id);
  if (error) throw error;
}

/** Booths an admin can book, with their team's name. */
export async function bookableBooths(): Promise<
  { id: string; name: string; teamId: string }[]
> {
  const { data, error } = await hub
    .from("booth")
    .select("id, name, org_id")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    teamId: row.org_id,
  }));
}
