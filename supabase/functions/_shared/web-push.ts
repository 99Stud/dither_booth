// @ts-types="@types/web-push"
import webpush from "web-push";

import type { Device, PushAnswer, PushOptions } from "./push.ts";

/**
 * Sends through the real push services, signed with the Hub's VAPID keys.
 * web-push only signs and encrypts; fetch sends it, so no Node https in
 * Deno. `ready` is false when a key is missing: nothing could be sent.
 */
export function createWebPushSender(env: (name: string) => string | undefined) {
  const vapidDetails = {
    // Who push services can contact about this sender: https: or mailto:.
    subject: env("VAPID_SUBJECT") ?? "",
    publicKey: env("VAPID_PUBLIC_KEY") ?? "",
    privateKey: env("VAPID_PRIVATE_KEY") ?? "",
  };
  const ready = Object.values(vapidDetails).every((value) => value.length > 0);

  async function send(
    device: Device,
    payload: string,
    options: PushOptions,
  ): Promise<PushAnswer> {
    const request = webpush.generateRequestDetails(
      {
        endpoint: device.endpoint,
        keys: { p256dh: device.p256dh, auth: device.auth },
      },
      payload,
      {
        vapidDetails,
        TTL: options.ttlSeconds,
        urgency: options.urgency,
        topic: options.topic,
      },
    );
    const res = await fetch(request.endpoint, {
      method: request.method,
      headers: request.headers as Record<string, string>,
      // A Node Buffer: copied into a plain array, as fetch takes it.
      body: Uint8Array.from(request.body as Uint8Array),
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) return { status: res.status };
    const reason = await res
      .json()
      .then((body: { reason?: unknown }) =>
        typeof body.reason === "string" ? body.reason : undefined,
      )
      .catch(() => undefined);
    return { status: res.status, reason };
  }

  return { ready, send };
}
