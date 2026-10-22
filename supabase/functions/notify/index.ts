import { createServiceClient } from "../_shared/clients.ts";
import { createDeviceStore } from "../_shared/devices.ts";
import { createWebPushSender } from "../_shared/web-push.ts";
import { handleNotify } from "./handler.ts";

const admin = createServiceClient();
const sender = createWebPushSender((name) => Deno.env.get(name));
const devices = createDeviceStore(admin);

Deno.serve((req) =>
  handleNotify(req, {
    secret: Deno.env.get("NOTIFY_SECRET") ?? "",
    ready: sender.ready,
    send: sender.send,
    forget: devices.forget,
    markDelivered: devices.markDelivered,
    listDevices: (orgId) => devices.list({ orgId }),

    async getAlert(id) {
      const { data: alert, error } = await admin
        .from("alert")
        .select(
          "id, org_id, booth_id, key, severity, opened_at, resolved_at, acked_at",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!alert) return null;
      const { data: booth, error: boothError } = await admin
        .from("booth")
        .select("name")
        .eq("id", alert.booth_id)
        .maybeSingle();
      if (boothError) throw boothError;
      return {
        id: alert.id,
        orgId: alert.org_id,
        key: alert.key,
        severity: alert.severity,
        boothName: booth?.name ?? "A booth",
        openedAt: alert.opened_at,
        resolvedAt: alert.resolved_at,
        acked: alert.acked_at !== null,
      };
    },
  }),
);
