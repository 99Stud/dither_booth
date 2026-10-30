import type { SupabaseClient } from "@supabase/supabase-js";

import type { Device } from "./push.ts";

type DeviceRow = {
  id: string;
  endpoint: string;
  p256dh_key: string;
  auth_secret: string;
};

const toDevice = (row: DeviceRow): Device => ({
  id: row.id,
  endpoint: row.endpoint,
  p256dh: row.p256dh_key,
  auth: row.auth_secret,
});

/** Staff devices (push_subscription rows), as the service role sees them. */
export function createDeviceStore(admin: SupabaseClient) {
  return {
    /** One member's devices, on every team. */
    async ofUser(userId: string): Promise<Device[]> {
      const { data, error } = await admin
        .from("push_subscription")
        .select("id, endpoint, p256dh_key, auth_secret")
        .eq("user_id", userId);
      if (error) throw error;
      return (data ?? []).map(toDevice);
    },

    /**
     * The devices an alert goes to: those on call for its event, else the
     * whole team (alert_devices holds the rule).
     */
    async forAlert(alertId: string): Promise<Device[]> {
      const { data, error } = await admin.rpc("alert_devices", {
        p_alert_id: alertId,
      });
      if (error) throw error;
      return ((data ?? []) as DeviceRow[]).map(toDevice);
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
