import type { AlertEvent, AlertSeverity } from "./alerts.ts";

/**
 * The push services a staff device may subscribe through. A device's
 * endpoint is a URL the Hub fetches, written by the device's owner: only
 * these hosts are accepted (the Hub's push_subscription check holds the same
 * list), so a stored endpoint can't make the Hub call anything else.
 */
export const PUSH_SERVICE_HOSTS = [
  "web.push.apple.com",
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
] as const;

/** Windows' push service spreads over many hosts under this one. */
export const PUSH_SERVICE_HOST_SUFFIX = ".notify.windows.com";

/** Whether a device endpoint is https on a known push service. */
export function isPushServiceEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    ((PUSH_SERVICE_HOSTS as readonly string[]).includes(url.hostname) ||
      url.hostname.endsWith(PUSH_SERVICE_HOST_SUFFIX))
  );
}

/** What a push carries, as Studio's service worker reads it. */
export type PushMessage = {
  title: string;
  body: string;
  /** One notification per alert: a reminder or "back to normal" replaces it. */
  tag: string;
  /** Where a tap leads, inside Studio. */
  url: string;
  event: AlertEvent | "test";
  severity: AlertSeverity;
  /**
   * When what it says happened (ISO 8601). Two pushes for one alert can
   * arrive out of order; the service worker keeps the newer one, by this.
   */
  at: string;
};
