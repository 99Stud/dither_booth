import {
  type AlertEvent,
  alertEventSchema,
} from "@dither-booth/protocol/alerts";
import { z } from "zod";

import {
  type Device,
  deliver,
  type PushDeps,
  type PushOptions,
  topicFor,
} from "../_shared/push.ts";
import { type AlertToPush, composeMessage } from "./messages.ts";

export type NotifyDeps = PushDeps & {
  /** NOTIFY_SECRET: the database sends it with every event. */
  secret: string;
  /** False when the VAPID keys are missing: nothing could be pushed. */
  ready: boolean;
  getAlert: (id: string) => Promise<AlertToPush | null>;
  listDevices: (orgId: string) => Promise<Device[]>;
  now?: () => Date;
};

const eventSchema = z.object({ alertId: z.uuid(), event: alertEventSchema });

/** How hard each event pushes, for an alert of a given severity. */
const EVENT_POLICY: Record<
  AlertEvent,
  (alert: AlertToPush) => Omit<PushOptions, "topic">
> = {
  // A device offline longer than an hour gets the next reminder instead.
  opened: (alert) => ({
    urgency: alert.severity === "critical" ? "high" : "normal",
    ttlSeconds: 3600,
  }),
  reminder: () => ({ urgency: "high", ttlSeconds: 3600 }),
  resolved: () => ({ urgency: "normal", ttlSeconds: 600 }),
};

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
 * every device of the alert's org.
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
  if (!deps.ready) {
    console.error("notify has no VAPID keys: nothing can be pushed");
    return reply(500, { error: "push is not configured" });
  }

  const parsed = eventSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return reply(400, { error: "invalid event" });
  const { alertId, event } = parsed.data;

  const alert = await deps.getAlert(alertId);
  if (!alert) return reply(404, { error: "unknown alert" });
  // An open or a reminder for an alert that moved on is dropped.
  if (event !== "resolved" && alert.resolvedAt)
    return reply(200, { skipped: "resolved" });
  if (event === "reminder" && alert.acked)
    return reply(200, { skipped: "acknowledged" });

  const message = composeMessage(
    alert,
    event,
    (deps.now ?? (() => new Date()))(),
  );
  const outcome = await deliver(
    await deps.listDevices(alert.orgId),
    JSON.stringify(message),
    { ...EVENT_POLICY[event](alert), topic: topicFor(alert.id) },
    deps,
  );
  return reply(200, outcome);
}
