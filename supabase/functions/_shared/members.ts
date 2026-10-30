import type { TeamMember, TeamRole } from "@dither-booth/protocol/team";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/** A member as the Hub stores them: `you` is the caller's to say. */
export type StoredMember = Omit<TeamMember, "you">;

/**
 * Every Auth user, staff and booths alike. Auth has no lookup by address,
 * so the team reads them all: a few dozen today. Past a thousand or so,
 * replace this with a SQL lookup on auth.users.
 */
export async function allUsers(client: SupabaseClient): Promise<User[]> {
  const users: User[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    // Until an empty page: Auth may serve fewer per page than asked.
    if (data.users.length === 0) return users;
    users.push(...data.users);
  }
}

/**
 * Who a user is on the Hub, as the service role reads it: a platform admin
 * or not, and their role in a team. The functions that act for staff decide
 * from these in their handlers.
 */
export function createMemberLookup(admin: SupabaseClient) {
  return {
    async isPlatformAdmin(userId: string): Promise<boolean> {
      const { data, error } = await admin
        .from("platform_admin")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },

    /** Their role in the team, or null when they aren't in it. */
    async roleIn(userId: string, orgId: string): Promise<TeamRole | null> {
      const { data, error } = await admin
        .from("org_member")
        .select("role")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return (data?.role as TeamRole | undefined) ?? null;
    },

    /** A team's members, with their address and how many devices they have on it. */
    async listMembers(orgId: string): Promise<StoredMember[]> {
      const [memberships, devices, users] = await Promise.all([
        admin
          .from("org_member")
          .select("user_id, role, created_at")
          .eq("org_id", orgId),
        admin.from("push_subscription").select("user_id").eq("org_id", orgId),
        allUsers(admin),
      ]);
      if (memberships.error) throw memberships.error;
      if (devices.error) throw devices.error;
      const byId = new Map(users.map((user) => [user.id, user]));
      const deviceCount = new Map<string, number>();
      for (const { user_id } of devices.data) {
        deviceCount.set(user_id, (deviceCount.get(user_id) ?? 0) + 1);
      }
      return memberships.data.map((row) => {
        const user = byId.get(row.user_id);
        return {
          userId: row.user_id,
          email: user?.email ?? "",
          role: row.role,
          devices: deviceCount.get(row.user_id) ?? 0,
          signedIn: Boolean(user?.last_sign_in_at),
          addedAt: row.created_at,
        };
      });
    },
  };
}
