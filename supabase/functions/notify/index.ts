// @ts-types="@types/web-push"
import webpush from "web-push";

import { createServiceClient } from "../_shared/clients.ts";
import { handleNotify } from "./handler.ts";

const admin = createServiceClient();

const vapidDetails = {
  // Who the push services can reach about this sender: https: or mailto:.
  subject: Deno.env.get("VAPID_SUBJECT") ?? "",
  publicKey: Deno.env.get("VAPID_PUBLIC_KEY") ?? "",
  privateKey: Deno.env.get("VAPID_PRIVATE_KEY") ?? "",
};

Deno.serve((req) =>
  handleNotify(req, {
    secret: Deno.env.get("NOTIFY_SECRET") ?? "",

    async getAlert(id) {
      const { data: alert, error } = await admin
        .from("alert")
        .select("id, key, severity, resolved_at, acked_at, org_id, booth_id")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!alert) return null;
      const { data: booth } = await admin
        .from("booth")
        .select("name")
        .eq("id", alert.booth_id)
        .maybeSingle();
      return {
        id: alert.id,
        key: alert.key,
        severity: alert.severity,
        boothName: booth?.name ?? "A booth",
        resolved: alert.resolved_at !== null,
        acked: alert.acked_at !== null,
        orgId: alert.org_id,
      };
    },

    async listSubscriptions(orgId) {
      const { data, error } = await admin
        .from("push_subscription")
        .select("id, endpoint, p256dh_key, auth_secret")
        .eq("org_id", orgId);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        endpoint: row.endpoint,
        p256dh: row.p256dh_key,
        auth: row.auth_secret,
      }));
    },

    // web-push only signs and encrypts; fetch sends it, so no Node https.
    async send(subscription, message, { urgency, ttlSeconds }) {
      const request = webpush.generateRequestDetails(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(message),
        {
          vapidDetails,
          TTL: ttlSeconds,
          urgency,
          // An alert id without its dashes: 32 base64url characters, so a
          // newer push for the same alert replaces one still waiting.
          topic: message.tag.replaceAll("-", ""),
        },
      );
      const res = await fetch(request.endpoint, {
        method: request.method,
        headers: request.headers as Record<string, string>,
        // A Node Buffer: copied into a plain array, as fetch takes it.
        body: Uint8Array.from(request.body as Uint8Array),
        signal: AbortSignal.timeout(10_000),
      });
      return res.status;
    },

    async removeSubscription(id) {
      await admin.from("push_subscription").delete().eq("id", id);
    },

    async markDelivered(id) {
      await admin
        .from("push_subscription")
        .update({ last_ok_at: new Date().toISOString() })
        .eq("id", id);
    },
  }),
);
