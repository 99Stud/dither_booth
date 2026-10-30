import type { OnCall } from "@dither-booth/protocol/on-call";
import type { TeamRole } from "@dither-booth/protocol/team";

import { onCallRequestSchema } from "@dither-booth/protocol/on-call";

import type { StoredMember } from "../_shared/members.ts";

import {
  bearerToken,
  preflight,
  replyToBrowser as reply,
} from "../_shared/browser.ts";

/** An event as the On call section names it, with the booth's team. */
export type StoredEvent = OnCall["event"] & { boothOrgId: string };

export type OnCallDeps = {
  /** The signed-in user a token belongs to, or null. */
  authenticate: (token: string) => Promise<string | null>;
  isPlatformAdmin: (userId: string) => Promise<boolean>;
  /** Their role in the team, or null when they aren't in it. */
  roleIn: (userId: string, orgId: string) => Promise<TeamRole | null>;
  findEvent: (eventId: string) => Promise<StoredEvent | null>;
  listMembers: (orgId: string) => Promise<StoredMember[]>;
  /** Who is on call for the event. */
  onCallIds: (eventId: string) => Promise<string[]>;
};

/** The caller first, then by address. */
const byCallerThenEmail = (
  a: { you: boolean; email: string },
  b: { you: boolean; email: string },
) => Number(b.you) - Number(a.you) || a.email.localeCompare(b.email);

/**
 * Studio's On call section: `GET ?eventId=`, an event and the booth's team,
 * each with their devices and whether they are on call. The booth's team and
 * platform admins read it; only admins change it, with a plain write on
 * event_on_call. The service role stays here: it reads the team's emails
 * and devices, which no member may.
 */
export async function handleOnCall(
  req: Request,
  deps: OnCallDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "GET") return reply(405, { error: "method not allowed" });

  const token = bearerToken(req);
  const callerId = token ? await deps.authenticate(token) : null;
  if (!callerId) return reply(401, { error: "sign in first" });

  const parsed = onCallRequestSchema.safeParse({
    eventId: new URL(req.url).searchParams.get("eventId"),
  });
  if (!parsed.success) return reply(400, { error: "invalid request" });
  const { eventId } = parsed.data;

  try {
    const [event, isAdmin] = await Promise.all([
      deps.findEvent(eventId),
      deps.isPlatformAdmin(callerId),
    ]);
    // The client's team sees the event, not who runs it: an event outside
    // the caller's booths answers like one that doesn't exist.
    const role = event ? await deps.roleIn(callerId, event.boothOrgId) : null;
    if (!event || (role === null && !isAdmin)) {
      return reply(404, { error: "unknown event" });
    }

    const [members, onCallIds] = await Promise.all([
      deps.listMembers(event.boothOrgId),
      deps.onCallIds(eventId),
    ]);
    const onCall = new Set(onCallIds);
    const { boothOrgId: _, ...shown } = event;
    return reply(200, {
      event: shown,
      team: members
        .map((member) => ({
          ...member,
          you: member.userId === callerId,
          onCall: onCall.has(member.userId),
        }))
        .sort(byCallerThenEmail),
    } satisfies OnCall);
  } catch (error) {
    console.error("on-call", eventId, error);
    return reply(500, { error: "the Hub couldn't read that, try again" });
  }
}
