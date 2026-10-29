import { z } from "zod";

/**
 * Studio's Team, as the Hub's `team` Edge Function speaks it: one POST per
 * action. Owners of a team and platform admins add, remove and promote its
 * members; the other members read the list.
 */

export const teamRoleSchema = z.enum(["owner", "member"]);

export type TeamRole = z.infer<typeof teamRoleSchema>;

/** Case and surrounding spaces don't matter: Auth stores addresses lowercased. */
export const memberEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email());

export const teamRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), orgId: z.uuid() }),
  z.object({
    action: z.literal("add"),
    orgId: z.uuid(),
    email: memberEmailSchema,
    role: teamRoleSchema.default("member"),
  }),
  z.object({ action: z.literal("remove"), orgId: z.uuid(), userId: z.uuid() }),
  z.object({
    action: z.literal("set-role"),
    orgId: z.uuid(),
    userId: z.uuid(),
    role: teamRoleSchema,
  }),
]);

export type TeamRequest = z.input<typeof teamRequestSchema>;

export const teamMemberSchema = z.object({
  userId: z.string(),
  email: z.string(),
  role: teamRoleSchema,
  /** The signed-in caller's own row. */
  you: z.boolean(),
  /** Devices that get this team's alerts. */
  devices: z.number().int().nonnegative(),
  /** Whether they have ever signed in to Studio. */
  signedIn: z.boolean(),
  addedAt: z.string(),
});

export type TeamMember = z.infer<typeof teamMemberSchema>;

export const teamListSchema = z.object({
  team: z.object({ id: z.string(), name: z.string() }),
  /** Whether the caller may add, remove and promote: an owner or an admin. */
  canManage: z.boolean(),
  /** The caller first, then owners, then by email. */
  members: z.array(teamMemberSchema),
});

export type TeamList = z.infer<typeof teamListSchema>;

export const teamAddedSchema = z.object({
  member: teamMemberSchema,
  /** False when the address already had a login, on another team. */
  created: z.boolean(),
});

export type TeamAdded = z.infer<typeof teamAddedSchema>;

/** Why the Hub refused an action, for the words Studio shows. */
export const TEAM_REFUSALS = [
  "already-member",
  "not-a-member",
  "own-row",
  "booth-login",
] as const;

export type TeamRefusal = (typeof TEAM_REFUSALS)[number];

/** The order the list comes in: the caller, owners, then by email. */
export const byTeamOrder = (a: TeamMember, b: TeamMember) =>
  Number(b.you) - Number(a.you) ||
  Number(b.role === "owner") - Number(a.role === "owner") ||
  a.email.localeCompare(b.email);
