import type { User } from "@supabase/supabase-js";

import { createSessionReader } from "../_shared/browser.ts";
import { createServiceClient } from "../_shared/clients.ts";
import { allUsers, createMemberLookup } from "../_shared/members.ts";
import { handleTeam } from "./handler.ts";

const admin = createServiceClient();
const members = createMemberLookup(admin);

/** Postgres' unique violation: the membership is already there. */
const UNIQUE_VIOLATION = "23505";

const isBooth = (user: User) => Boolean(user.app_metadata?.booth_id);

Deno.serve((req) =>
  handleTeam(req, {
    authenticate: createSessionReader(admin),

    isPlatformAdmin: members.isPlatformAdmin,
    roleIn: members.roleIn,

    async teamName(orgId) {
      const { data, error } = await admin
        .from("org")
        .select("name")
        .eq("id", orgId)
        .maybeSingle();
      if (error) throw error;
      return data?.name ?? null;
    },

    listMembers: members.listMembers,

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

    async forgetUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
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
