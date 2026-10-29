import {
  type TeamAdded,
  teamAddedSchema,
  type TeamList,
  teamListSchema,
  type TeamMember,
  type TeamRefusal,
  type TeamRequest,
  type TeamRole,
} from "@dither-booth/protocol/team";
import { FunctionsHttpError } from "@supabase/supabase-js";

import { hub } from "./hub";

export type { TeamList, TeamMember, TeamRole };

/** The Hub refused a Team action: its status, and why when it says. */
export class TeamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: TeamRefusal,
  ) {
    super(message);
  }
}

async function callTeam(body: TeamRequest): Promise<unknown> {
  const { data, error } = await hub.functions.invoke("team", {
    method: "POST",
    body,
  });
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    const refusal = (await response.json().catch(() => ({}))) as {
      error?: string;
      reason?: TeamRefusal;
    };
    throw new TeamError(
      refusal.error ?? "The Hub refused.",
      response.status,
      refusal.reason,
    );
  }
  if (error) throw error;
  return data;
}

/**
 * The team the signed-in staff member works for (the first, for now). A
 * platform admin reads every membership, so only their own count.
 */
export async function staffOrgId(): Promise<string | null> {
  const { data: auth } = await hub.auth.getSession();
  const userId = auth.session?.user.id;
  if (!userId) return null;
  const { data, error } = await hub
    .from("org_member")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1);
  if (error) throw error;
  return data?.[0]?.org_id ?? null;
}

export type TeamChoice = { id: string; name: string };

/** The teams the signed-in user sees: their own, or every one for an admin. */
export async function visibleTeams(): Promise<TeamChoice[]> {
  const { data, error } = await hub
    .from("org")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export const readTeam = async (orgId: string): Promise<TeamList> =>
  teamListSchema.parse(await callTeam({ action: "list", orgId }));

export const addMember = async (
  orgId: string,
  email: string,
  role: TeamRole,
): Promise<TeamAdded> =>
  teamAddedSchema.parse(await callTeam({ action: "add", orgId, email, role }));

export async function removeMember(orgId: string, userId: string) {
  await callTeam({ action: "remove", orgId, userId });
}

export async function setRole(orgId: string, userId: string, role: TeamRole) {
  await callTeam({ action: "set-role", orgId, userId, role });
}

export type MemberTone = "ok" | "warn" | "off";

/** Whether a member's phone will ring: the line under their address. */
export function memberStatus(member: TeamMember): {
  text: string;
  tone: MemberTone;
} {
  if (member.devices > 0) {
    return {
      text: member.devices === 1 ? "1 device" : `${member.devices} devices`,
      tone: "ok",
    };
  }
  if (!member.signedIn) return { text: "Hasn't signed in yet", tone: "off" };
  return { text: "No device yet: won't get alerts", tone: "warn" };
}

/** The line that leads the screen: how many are in, how many get alerts. */
export function teamSummary(members: TeamMember[]): string {
  const alerted = members.filter((member) => member.devices > 0).length;
  const people =
    members.length === 1 ? "1 member" : `${members.length} members`;
  return `${people} · ${alerted} get${alerted === 1 ? "s" : ""} alerts`;
}

/** What to send someone just added, so they know how to sign in. */
export const shareMessage = (team: string, email: string, studio: string) =>
  `You're on the ${team} team in Studio, Dither Booth's alerts app. ` +
  `Open ${studio}, sign in with ${email} and the code we email you, ` +
  `then turn on notifications in This device.`;

/** The words for a refused add, shown under the address. */
export function addErrorMessage(
  error: unknown,
  email: string,
  team: string,
): string {
  if (error instanceof TeamError) {
    if (error.reason === "already-member")
      return `${email} is already in ${team}.`;
    if (error.reason === "booth-login") {
      return "That address belongs to a booth, not a person.";
    }
    if (error.status === 400) {
      return "Enter an email address, like lea@example.com.";
    }
    if (error.status === 403) {
      return "Only owners and platform admins add people.";
    }
  }
  return error instanceof Error && error.message
    ? `Couldn't add ${email}: ${error.message}`
    : `Couldn't add ${email}. Check the connection and try again.`;
}
