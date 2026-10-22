/** A staff device that gets pushes (a row of push_subscription). */
export type Device = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/** What a push service answered: its HTTP status, and its reason when it gave one. */
export type PushAnswer = { status: number; reason?: string };

export type PushOptions = {
  urgency: "high" | "normal";
  ttlSeconds: number;
  topic: string;
};

export type PushDeps = {
  send: (
    device: Device,
    payload: string,
    options: PushOptions,
  ) => Promise<PushAnswer>;
  /** The push service says the device is gone: forget it. */
  forget: (deviceId: string) => Promise<void>;
  markDelivered: (deviceId: string) => Promise<void>;
};

export type DeliveryOutcome = {
  sent: number;
  removed: number;
  failed: number;
  /** Every non-2xx answer, by push service host: what a log needs. */
  refused: Record<string, string[]>;
};

/**
 * The device will never get a push again: unknown or expired at the push
 * service (404, 410), or a token Apple can't read (400 BadWebPushToken).
 */
export const isGone = ({ status, reason }: PushAnswer) =>
  status === 404 ||
  status === 410 ||
  (status === 400 && reason === "BadWebPushToken");

/** Pushes one payload to each device at once, and says how it went. */
export async function deliver(
  devices: Device[],
  payload: string,
  options: PushOptions,
  deps: PushDeps,
): Promise<DeliveryOutcome> {
  const outcome: DeliveryOutcome = {
    sent: 0,
    removed: 0,
    failed: 0,
    refused: {},
  };
  const refuse = (device: Device, what: string) => {
    const host = new URL(device.endpoint).host;
    (outcome.refused[host] ??= []).push(what);
  };

  await Promise.all(
    devices.map(async (device) => {
      try {
        const answer = await deps.send(device, payload, options);
        if (answer.status >= 200 && answer.status < 300) {
          await deps.markDelivered(device.id);
          outcome.sent += 1;
          return;
        }
        refuse(
          device,
          `${answer.status}${answer.reason ? ` ${answer.reason}` : ""}`,
        );
        if (isGone(answer)) {
          await deps.forget(device.id);
          outcome.removed += 1;
        } else {
          outcome.failed += 1;
        }
      } catch (error) {
        refuse(device, error instanceof Error ? error.message : String(error));
        outcome.failed += 1;
      }
    }),
  );

  if (Object.keys(outcome.refused).length > 0)
    console.warn("push refused", outcome.refused);
  return outcome;
}

/** A push topic from an id: 32 base64url characters at most. */
export const topicFor = (id: string) => id.replaceAll("-", "").slice(0, 32);
