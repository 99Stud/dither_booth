import { z } from "zod";

import {
  type AlertForPush,
  composeMessage,
  type PushMessage,
} from "./messages.ts";

export type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type NotifyDeps = {
  /** NOTIFY_SECRET: the database sends it with every event. */
  secret: string;
  getAlert: (id: string) => Promise<(AlertForPush & { orgId: string }) | null>;
  listSubscriptions: (orgId: string) => Promise<PushSubscriptionRow[]>;
  /** Sends one push; resolves with the push service's HTTP status. */
  send: (
    subscription: PushSubscriptionRow,
    message: PushMessage,
    options: { urgency: "high" | "normal"; ttlSeconds: number },
  ) => Promise<number>;
  /** The push service says this device is gone (404, 410). */
  removeSubscription: (id: string) => Promise<void>;
  markDelivered: (id: string) => Promise<void>;
};

const eventSchema = z.object({
  alertId: z.uuid(),
  event: z.enum(["opened", "resolved", "reminder"]),
});

const reply = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status });

/** Compares without leaking, through timing, how much of a guess was right. */
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

/**
 * One alert event from the database (opened, resolved, reminder), pushed to
 * every device of the alert's org. A device the push service says is gone
 * is forgotten.
 */
export async function handleNotify(
  req: Request,
  deps: NotifyDeps,
): Promise<Response> {
  if (req.method !== "POST") return reply(405, { error: "method not allowed" });
  if (
    !deps.secret ||
    !sameSecret(req.headers.get("x-notify-secret") ?? "", deps.secret)
  ) {
    return reply(401, { error: "unauthorized" });
  }

  const parsed = eventSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return reply(400, { error: "invalid event" });
  const { alertId, event } = parsed.data;

  const alert = await deps.getAlert(alertId);
  if (!alert) return reply(404, { error: "unknown alert" });
  // Late reminders and late opens for an alert that moved on are dropped.
  if (event !== "resolved" && alert.resolved)
    return reply(200, { skipped: "resolved" });
  if (event === "reminder" && alert.acked)
    return reply(200, { skipped: "acknowledged" });

  const message = composeMessage(alert, event);
  const options = {
    urgency:
      alert.severity === "critical" && event !== "resolved" ? "high" : "normal",
    // A phone offline longer than this gets the next reminder instead.
    ttlSeconds: event === "resolved" ? 600 : 3600,
  } as const;

  const result = { sent: 0, removed: 0, failed: 0 };
  for (const subscription of await deps.listSubscriptions(alert.orgId)) {
    try {
      const status = await deps.send(subscription, message, options);
      if (status >= 200 && status < 300) {
        result.sent += 1;
        await deps.markDelivered(subscription.id);
      } else if (status === 404 || status === 410) {
        result.removed += 1;
        await deps.removeSubscription(subscription.id);
      } else {
        result.failed += 1;
        console.error("push refused", subscription.id, status);
      }
    } catch (error) {
      result.failed += 1;
      console.error("push failed", subscription.id, error);
    }
  }
  return reply(200, result);
}
