import type { PushMessage } from "@dither-booth/protocol/push";

import {
  bearerToken,
  preflight,
  replyToBrowser as reply,
} from "../_shared/browser.ts";
import {
  type Device,
  deliver,
  type PushDeps,
  topicFor,
} from "../_shared/push.ts";

export type SendTestDeps = PushDeps & {
  /** The signed-in user a token belongs to, or null. */
  authenticate: (token: string) => Promise<string | null>;
  /** False when the VAPID keys are missing: nothing could be pushed. */
  ready: boolean;
  listDevices: (userId: string) => Promise<Device[]>;
  now?: () => Date;
};

/**
 * Sends a test push to the caller's own devices, so staff can check a device
 * receives alerts before an event.
 */
export async function handleSendTest(
  req: Request,
  deps: SendTestDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return reply(405, { error: "method not allowed" });

  const token = bearerToken(req);
  const userId = token ? await deps.authenticate(token) : null;
  if (!userId) return reply(401, { error: "sign in first" });
  if (!deps.ready) {
    console.error("send-test has no VAPID keys: nothing can be pushed");
    return reply(500, { error: "push is not configured" });
  }

  const message: PushMessage = {
    title: "Test notification",
    body: "Alerts from the Hub will arrive like this.",
    tag: `test-${userId}`,
    url: "/",
    event: "test",
    severity: "warn",
    at: (deps.now ?? (() => new Date()))().toISOString(),
  };
  const outcome = await deliver(
    await deps.listDevices(userId),
    JSON.stringify(message),
    { urgency: "normal", ttlSeconds: 60, topic: topicFor(userId) },
    deps,
  );
  return reply(200, outcome);
}
