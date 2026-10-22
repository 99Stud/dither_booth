import type { SupabaseClient } from "@supabase/supabase-js";

import type { Device } from "./push.ts";

/** Staff devices (push_subscription rows), as the service role sees them. */
export function createDeviceStore(admin: SupabaseClient) {
  return {
    /** An org's devices, or one member's. */
    async list(
      filter: { orgId: string } | { userId: string },
    ): Promise<Device[]> {
      const query = admin
        .from("push_subscription")
        .select("id, endpoint, p256dh_key, auth_secret");
      const { data, error } = await ("orgId" in filter
        ? query.eq("org_id", filter.orgId)
        : query.eq("user_id", filter.userId));
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        endpoint: row.endpoint,
        p256dh: row.p256dh_key,
        auth: row.auth_secret,
      }));
    },

    async forget(deviceId: string) {
      const { error } = await admin
        .from("push_subscription")
        .delete()
        .eq("id", deviceId);
      if (error) throw error;
    },

    async markDelivered(deviceId: string) {
      const { error } = await admin
        .from("push_subscription")
        .update({ last_ok_at: new Date().toISOString() })
        .eq("id", deviceId);
      if (error) throw error;
    },
  };
}
