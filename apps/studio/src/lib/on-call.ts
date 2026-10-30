import {
  type OnCall,
  type OnCallMember,
  onCallSchema,
} from "@dither-booth/protocol/on-call";

import type { EventRow } from "./events";

import { messageOf, postgresCode } from "./errors";
import { hub } from "./hub";
import { type MemberTone, memberStatus } from "./team";

export type { OnCall, OnCallMember };

/** An event, and the booth's team with who is on call for it. */
export async function readOnCall(eventId: string): Promise<OnCall> {
  const { data, error } = await hub.functions.invoke(
    `on-call?${new URLSearchParams({ eventId })}`,
    { method: "GET" },
  );
  if (error) throw error;
  return onCallSchema.parse(data);
}

/** Puts one person on call for an event, or takes them off. */
export async function setOnCall(
  eventId: string,
  userId: string,
  onCall: boolean,
): Promise<void> {
  const { error } = onCall
    ? await hub
        .from("event_on_call")
        .insert({ event_id: eventId, user_id: userId })
    : await hub
        .from("event_on_call")
        .delete()
        .eq("event_id", eventId)
        .eq("user_id", userId);
  // Already on call (another admin, a second tap): what was asked holds.
  if (error && postgresCode(error) !== ALREADY_ON_CALL) throw error;
}

/** Postgres' codes for what the Hub refuses, read once here. */
const ALREADY_ON_CALL = "23505";
const NOT_ALLOWED = "42501";

/** The words when a switch didn't save. */
export function onCallErrorMessage(
  error: unknown,
  email: string,
  onCall: boolean,
): string {
  if (postgresCode(error) === NOT_ALLOWED) {
    return "Only platform admins change who's on call.";
  }
  const what = onCall ? `put ${email} on call` : `take ${email} off call`;
  return `Couldn't ${what}: ${messageOf(error, "the Hub didn't answer")}. Check your connection and try again.`;
}

/**
 * Whether a teammate's phone will ring, as Team says it; on call without a
 * device, it's a warning, since they're counted on and won't hear.
 */
export function onCallStatus(member: OnCallMember): {
  text: string;
  tone: MemberTone;
} {
  if (member.onCall && member.devices === 0) {
    return {
      text: member.signedIn
        ? "No device yet: won't get alerts until they turn on notifications"
        : "Hasn't signed in yet: won't get alerts",
      tone: "warn",
    };
  }
  return memberStatus(member);
}

export type OnCallTone = "ok" | "warn" | "off";

/**
 * Who gets the booth's alerts: the line under the section's title, and how
 * many on call the alerts actually reach (0: the whole team), for its badge.
 * The fallback to the whole team is never a surprise.
 */
export function onCallSummary(
  team: OnCallMember[],
  boothName: string,
  eventName: string,
): { reaching: number; text: string; tone: OnCallTone } {
  const onCall = team.filter((member) => member.onCall);
  if (onCall.length === 0) {
    return {
      reaching: 0,
      text: `Nobody on call: the whole team gets ${boothName}'s alerts.`,
      tone: "off",
    };
  }
  if (onCall.every((member) => member.devices === 0)) {
    return {
      reaching: 0,
      text:
        onCall.length === 1
          ? "They have no device yet, so the whole team gets the alerts."
          : "None of them has a device yet, so the whole team gets the alerts.",
      tone: "warn",
    };
  }
  return {
    reaching: onCall.length,
    text: `They get ${boothName}'s alerts during ${eventName}.`,
    tone: "ok",
  };
}

/** The soonest event, on now or to come, that the user is on call for. */
export type NextOnCall = Pick<
  EventRow,
  "name" | "boothName" | "startsAt" | "endsAt"
>;

export async function myNextOnCall(
  userId: string,
  now = new Date(),
): Promise<NextOnCall | null> {
  const { data: rows, error } = await hub
    .from("event_on_call")
    .select("event_id, booth_id")
    .eq("user_id", userId);
  if (error) throw error;
  if (!rows?.length) return null;
  const [events, booths] = await Promise.all([
    hub
      .from("event")
      .select("id, name, starts_at, ends_at, booth_id")
      .in(
        "id",
        rows.map((row) => row.event_id),
      )
      .gt("ends_at", now.toISOString())
      .order("starts_at")
      .limit(1),
    hub
      .from("booth")
      .select("id, name")
      .in(
        "id",
        rows.map((row) => row.booth_id),
      ),
  ]);
  if (events.error) throw events.error;
  if (booths.error) throw booths.error;
  const event = events.data?.[0];
  if (!event) return null;
  return {
    name: event.name,
    boothName:
      booths.data?.find((booth) => booth.id === event.booth_id)?.name ?? null,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
  };
}
