import type { PushMessage } from "@dither-booth/protocol/push";

/** A notification already on the device, as getNotifications() gives it. */
export type ShownNotification = {
  title: string;
  body: string;
  data?: { url?: string; at?: string; event?: string; severity?: string };
};

export type NotificationToShow = {
  title: string;
  options: {
    body: string;
    tag: string;
    data: { url: string; at: string; event: string; severity: string };
    icon: string;
    badge: string;
    /** Vibrate and sound again when it replaces one: reminders do. */
    renotify: boolean;
    /** Stays until handled: open critical alerts do (where supported). */
    requireInteraction: boolean;
    silent: boolean;
  };
};

const ICON = "/icons/icon-192.png";

/**
 * What to show for an incoming push. Two pushes for one alert can arrive out
 * of order (a late "opened" after "back to normal"): if the notification
 * already shown for it is newer, that one is shown again, quietly. A push
 * must always show something, or the browser may revoke the subscription.
 */
export function notificationFor(
  incoming: PushMessage,
  shown: ShownNotification[],
): NotificationToShow {
  const newer = shown.find(
    (notification) =>
      notification.data?.at !== undefined && notification.data.at > incoming.at,
  );
  if (newer) {
    return {
      title: newer.title,
      options: {
        body: newer.body,
        tag: incoming.tag,
        data: {
          url: newer.data?.url ?? incoming.url,
          at: newer.data?.at ?? incoming.at,
          event: newer.data?.event ?? incoming.event,
          severity: newer.data?.severity ?? incoming.severity,
        },
        icon: ICON,
        badge: ICON,
        renotify: false,
        requireInteraction: false,
        silent: true,
      },
    };
  }
  return {
    title: incoming.title,
    options: {
      body: incoming.body,
      tag: incoming.tag,
      data: {
        url: incoming.url,
        at: incoming.at,
        event: incoming.event,
        severity: incoming.severity,
      },
      icon: ICON,
      badge: ICON,
      renotify: incoming.event === "reminder",
      requireInteraction:
        incoming.severity === "critical" && incoming.event !== "resolved",
      silent: false,
    },
  };
}

/** A push that isn't a message from the Hub still shows something. */
export function parsePush(text: string | undefined): PushMessage {
  try {
    const message = JSON.parse(text ?? "") as Partial<PushMessage>;
    if (typeof message.title === "string" && typeof message.tag === "string") {
      return {
        title: message.title,
        body: typeof message.body === "string" ? message.body : "",
        tag: message.tag,
        url: typeof message.url === "string" ? message.url : "/",
        event: message.event ?? "opened",
        severity: message.severity ?? "warn",
        at:
          typeof message.at === "string"
            ? message.at
            : new Date().toISOString(),
      };
    }
  } catch {
    // Falls through to the generic notification.
  }
  return {
    title: "Dither Booth",
    body: "Open Studio to see what happened.",
    tag: "studio",
    url: "/",
    event: "opened",
    severity: "warn",
    at: new Date().toISOString(),
  };
}
