import { isPushServiceEndpoint } from "@dither-booth/protocol/push";

import { HUB, hub } from "./hub";

/** What this device can do about notifications, before asking anything. */
export type DeviceSupport =
  | "ready"
  /** iPhone or iPad in Safari: push only reaches a Home Screen app. */
  | "needs-home-screen"
  | "unsupported";

export type BrowserTraits = {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  isAppleMobile: boolean;
  isStandalone: boolean;
};

export function readBrowserTraits(): BrowserTraits {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    // iPadOS reports itself as a Mac: a touch screen tells them apart.
    isAppleMobile:
      /iPhone|iPad|iPod/u.test(navigator.userAgent) ||
      (navigator.userAgent.includes("Macintosh") &&
        navigator.maxTouchPoints > 1),
    isStandalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      nav.standalone === true,
  };
}

export function deviceSupport(traits: BrowserTraits): DeviceSupport {
  if (traits.isAppleMobile && !traits.isStandalone) return "needs-home-screen";
  return traits.hasServiceWorker && traits.hasPushManager
    ? "ready"
    : "unsupported";
}

/** The VAPID public key as pushManager.subscribe takes it. */
export function vapidKeyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4))
    .replaceAll("-", "+")
    .replaceAll("_", "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** A browser subscription as a push_subscription row. */
export function deviceRow(
  subscription: PushSubscriptionJSON,
  owner: { orgId: string; userId: string },
  userAgent: string,
) {
  const { endpoint, keys } = subscription;
  if (!endpoint || !keys?.p256dh || !keys.auth) {
    throw new Error("The browser gave an incomplete subscription.");
  }
  if (!isPushServiceEndpoint(endpoint)) {
    throw new Error("This browser's push service isn't one the Hub accepts.");
  }
  return {
    org_id: owner.orgId,
    user_id: owner.userId,
    endpoint,
    p256dh_key: keys.p256dh,
    auth_secret: keys.auth,
    user_agent: userAgent.slice(0, 300),
  };
}

const registration = () => navigator.serviceWorker.register("/sw.js");

/** This device's subscription, if notifications are on in the browser. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  return (await registration()).pushManager.getSubscription();
}

/** Whether the Hub has this device: the browser and the Hub can disagree. */
export async function isKnownToHub(endpoint: string): Promise<boolean> {
  const { data, error } = await hub
    .from("push_subscription")
    .select("id")
    .eq("endpoint", endpoint);
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * Turns notifications on: asks permission (call it straight from a tap: iOS
 * only shows the prompt then), subscribes, and tells the Hub.
 */
export async function turnOn(owner: {
  orgId: string;
  userId: string;
}): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notifications aren't allowed for Studio on this device.");
  }
  const reg = await registration();
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKeyBytes(HUB.vapidPublicKey),
    }));
  const row = deviceRow(subscription.toJSON(), owner, navigator.userAgent);

  const { error } = await hub.from("push_subscription").insert(row);
  if (!error) return;
  if (error.code !== "23505") throw error;
  // Known already (notifications turned on before): its keys may be new.
  const { data, error: updateError } = await hub
    .from("push_subscription")
    .update({
      p256dh_key: row.p256dh_key,
      auth_secret: row.auth_secret,
      user_agent: row.user_agent,
    })
    .eq("endpoint", row.endpoint)
    .select("id");
  if (updateError) throw updateError;
  if ((data ?? []).length === 0) {
    throw new Error(
      "This device gets someone else's alerts. Turn them off in their Studio first.",
    );
  }
}

/** Turns notifications off here, and forgets the device on the Hub. */
export async function turnOff(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  const { error } = await hub
    .from("push_subscription")
    .delete()
    .eq("endpoint", subscription.endpoint);
  if (error) throw error;
  await subscription.unsubscribe();
}

export type TestOutcome = { sent: number; removed: number; failed: number };

/** A test notification to every device of the signed-in staff member. */
export async function sendTest(): Promise<TestOutcome> {
  const { data, error } = await hub.functions.invoke<TestOutcome>("send-test", {
    method: "POST",
  });
  if (error) throw error;
  return data ?? { sent: 0, removed: 0, failed: 0 };
}
