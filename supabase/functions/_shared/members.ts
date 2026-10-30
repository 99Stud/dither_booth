import type { TeamRole } from "@dither-booth/protocol/team";
import type { SupabaseClient } from "@supabase/supabase-js";

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
  };
}
