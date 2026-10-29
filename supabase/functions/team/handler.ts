import {
  byTeamOrder,
  type TeamMember,
  type TeamRefusal,
  teamRequestSchema,
  type TeamRole,
} from "@dither-booth/protocol/team";

import {
  bearerToken,
  preflight,
  replyToBrowser as reply,
} from "../_shared/browser.ts";

/** A member as the Hub stores them: `you` is the handler's to say. */
export type StoredMember = Omit<TeamMember, "you">;

export type TeamDeps = {
  /** The signed-in user a token belongs to, or null. */
  authenticate: (token: string) => Promise<string | null>;
  /**
   * What the user may do on a team: "manage" for its owners and platform
   * admins, "read" for its other members, null otherwise (or no such team).
   */
  access: (userId: string, orgId: string) => Promise<"manage" | "read" | null>;
  teamName: (orgId: string) => Promise<string>;
  listMembers: (orgId: string) => Promise<StoredMember[]>;
  /** The login for an address, made (with no email sent) if there is none. */
  findOrCreateUser: (
    email: string,
  ) => Promise<{ userId: string; created: boolean; isBooth: boolean }>;
  /** False when they already are a member. */
  addMember: (
    orgId: string,
    userId: string,
    role: TeamRole,
  ) => Promise<boolean>;
  /** False when they weren't a member. Their devices on it go too. */
  removeMember: (orgId: string, userId: string) => Promise<boolean>;
  /** False when they aren't a member. */
  setRole: (orgId: string, userId: string, role: TeamRole) => Promise<boolean>;
};

const refuse = (status: number, reason: TeamRefusal, error: string) =>
  reply(status, { error, reason });

/**
 * Studio's Team: a team's members with their devices, and, for its owners
 * and platform admins, adding, removing and promoting them. The service role
 * stays here, behind these checks: it reads the members' emails and makes
 * logins, which no browser may.
 *
 * Nobody removes or demotes themselves here, so nobody locks themselves
 * out; a platform admin can still fix any team, and join one.
 */
export async function handleTeam(
  req: Request,
  deps: TeamDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return reply(405, { error: "method not allowed" });

  const token = bearerToken(req);
  const callerId = token ? await deps.authenticate(token) : null;
  if (!callerId) return reply(401, { error: "sign in first" });

  const parsed = teamRequestSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) return reply(400, { error: "invalid request" });
  const request = parsed.data;

  try {
    // Someone else's team answers like a team that doesn't exist.
    const access = await deps.access(callerId, request.orgId);
    if (!access) return reply(404, { error: "unknown team" });

    const members = async () =>
      (await deps.listMembers(request.orgId))
        .map((member) => ({ ...member, you: member.userId === callerId }))
        .sort(byTeamOrder);
    const memberOf = async (userId: string) =>
      (await members()).find((member) => member.userId === userId)!;

    if (request.action === "list") {
      return reply(200, {
        team: { id: request.orgId, name: await deps.teamName(request.orgId) },
        canManage: access === "manage",
        members: await members(),
      });
    }

    if (access !== "manage") {
      return reply(403, {
        error: "only owners and platform admins change the team",
      });
    }

    if (request.action === "add") {
      const user = await deps.findOrCreateUser(request.email);
      if (user.isBooth) {
        return refuse(422, "booth-login", "that address is a booth's login");
      }
      if (!(await deps.addMember(request.orgId, user.userId, request.role))) {
        return refuse(409, "already-member", "already in the team");
      }
      return reply(200, {
        member: await memberOf(user.userId),
        created: user.created,
      });
    }

    if (request.userId === callerId) {
      return refuse(422, "own-row", "you can't change your own membership");
    }

    if (request.action === "remove") {
      const member = (await members()).find(
        (row) => row.userId === request.userId,
      );
      if (!member || !(await deps.removeMember(request.orgId, member.userId))) {
        return refuse(404, "not-a-member", "not in the team");
      }
      return reply(200, { member });
    }

    if (!(await deps.setRole(request.orgId, request.userId, request.role))) {
      return refuse(404, "not-a-member", "not in the team");
    }
    return reply(200, { member: await memberOf(request.userId) });
  } catch (error) {
    console.error("team", request.action, request.orgId, error);
    return reply(500, { error: "the Hub couldn't do that, try again" });
  }
}
