import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createSessionReader } from "../_shared/browser.ts";
import { createServiceClient } from "../_shared/clients.ts";
import { handleTeam, type StoredMember } from "./handler.ts";

const admin = createServiceClient();

/** Postgres' unique violation: the membership is already there. */
const UNIQUE_VIOLATION = "23505";

/**
 * Every Auth user, staff and booths alike. Auth has no lookup by address,
 * so the team reads them all: a few dozen today. Past a thousand or so,
 * replace this with a SQL lookup on auth.users.
 */
async function allUsers(client: SupabaseClient): Promise<User[]> {
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

const isBooth = (user: User) => Boolean(user.app_metadata?.booth_id);

Deno.serve((req) =>
  handleTeam(req, {
    authenticate: createSessionReader(admin),

    async access(userId, orgId) {
      const [{ data: adminRow, error: adminError }, { data: member, error }] =
        await Promise.all([
          admin
            .from("platform_admin")
            .select("user_id")
            .eq("user_id", userId)
            .maybeSingle(),
          admin
            .from("org_member")
            .select("role")
            .eq("org_id", orgId)
            .eq("user_id", userId)
            .maybeSingle(),
        ]);
      if (adminError) throw adminError;
      if (error) throw error;
      if (member?.role === "owner") return "manage";
      if (adminRow) {
        // An admin manages any team, as long as it exists.
        const { data: org, error: orgError } = await admin
          .from("org")
          .select("id")
          .eq("id", orgId)
          .maybeSingle();
        if (orgError) throw orgError;
        return org ? "manage" : null;
      }
      return member ? "read" : null;
    },

    async teamName(orgId) {
      const { data, error } = await admin
        .from("org")
        .select("name")
        .eq("id", orgId)
        .single();
      if (error) throw error;
      return data.name;
    },

    async listMembers(orgId): Promise<StoredMember[]> {
      const [members, devices, users] = await Promise.all([
        admin
          .from("org_member")
          .select("user_id, role, created_at")
          .eq("org_id", orgId),
        admin.from("push_subscription").select("user_id").eq("org_id", orgId),
        allUsers(admin),
      ]);
      if (members.error) throw members.error;
      if (devices.error) throw devices.error;
      const byId = new Map(users.map((user) => [user.id, user]));
      const deviceCount = new Map<string, number>();
      for (const { user_id } of devices.data) {
        deviceCount.set(user_id, (deviceCount.get(user_id) ?? 0) + 1);
      }
      return members.data.map((row) => {
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

    async findOrCreateUser(email) {
      // Confirmed, with no password and no email sent: they sign in with
      // the code Studio sends them, as every staff member does.
      const { data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (!error) {
        return { userId: data.user.id, created: true, isBooth: false };
      }
      if (error.code !== "email_exists") throw error;
      const user = (await allUsers(admin)).find(
        (candidate) => candidate.email?.toLowerCase() === email,
      );
      if (!user) throw new Error(`no user for an address Auth knows`);
      return { userId: user.id, created: false, isBooth: isBooth(user) };
    },

    async addMember(orgId, userId, role) {
      const { error } = await admin
        .from("org_member")
        .insert({ org_id: orgId, user_id: userId, role });
      if (error?.code === UNIQUE_VIOLATION) return false;
      if (error) throw error;
      return true;
    },

    async removeMember(orgId, userId) {
      const { data, error } = await admin
        .from("org_member")
        .delete()
        .eq("org_id", orgId)
        .eq("user_id", userId)
        .select("user_id");
      if (error) throw error;
      return data.length > 0;
    },

    async setRole(orgId, userId, role) {
      const { data, error } = await admin
        .from("org_member")
        .update({ role })
        .eq("org_id", orgId)
        .eq("user_id", userId)
        .select("user_id");
      if (error) throw error;
      return data.length > 0;
    },
  }),
);
