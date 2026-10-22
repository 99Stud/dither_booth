import {
  type AlertEvent,
  type AlertSeverity,
  alertWording,
} from "@dither-booth/protocol/alerts";

/** An alert, as a push about it needs it. */
export type AlertToPush = {
  id: string;
  orgId: string;
  key: string;
  severity: AlertSeverity;
  boothName: string;
  /** ISO 8601 times, or null. */
  openedAt: string;
  resolvedAt: string | null;
  acked: boolean;
};

/** What Studio's service worker shows on a staff device. */
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
   * When what it says happened. Two pushes for one alert can arrive out of
   * order; the service worker keeps the newer one, by this.
   */
  at: string;
};

export function composeMessage(
  alert: AlertToPush,
  event: AlertEvent,
  now: Date,
): PushMessage {
  const { what, todo, fixed } = alertWording(alert.key);
  const common = {
    tag: alert.id,
    url: `/alerts/${alert.id}`,
    event,
    severity: alert.severity,
  };
  switch (event) {
    case "opened":
      return {
        ...common,
        title: `${alert.boothName}: ${what}`,
        body: todo,
        at: alert.openedAt,
      };
    case "reminder":
      return {
        ...common,
        title: `${alert.boothName}: ${what}`,
        body: `Still to do. ${todo}`,
        at: now.toISOString(),
      };
    case "resolved":
      return {
        ...common,
        title: `${alert.boothName}: back to normal`,
        body: `${what}: ${fixed}`,
        at: alert.resolvedAt ?? now.toISOString(),
      };
  }
}
