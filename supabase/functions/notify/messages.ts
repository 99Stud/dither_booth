/** An alert as a push needs it. */
export type AlertForPush = {
  id: string;
  key: string;
  severity: "warn" | "critical";
  boothName: string;
  resolved: boolean;
  acked: boolean;
};

export type AlertEvent = "opened" | "resolved" | "reminder";

/** What the Studio app's service worker shows (PR 7 reads it). */
export type PushMessage = {
  title: string;
  body: string;
  /** One notification per alert: a reminder or "back to normal" replaces it. */
  tag: string;
  /** Where a tap leads, inside Studio. */
  url: string;
  event: AlertEvent;
  severity: AlertForPush["severity"];
};

/** The glossary's words for each alert, and what staff should do. */
const WORDING: Record<string, { what: string; todo: string }> = {
  "printer.paper-out": {
    what: "Out of paper",
    todo: "It can't print: load a new roll.",
  },
  "printer.error": {
    what: "Printer error",
    todo: "It can't print: check the printer.",
  },
  "printer.disconnected": {
    what: "Printer not connected",
    todo: "It can't print: check the printer's USB cable and power.",
  },
  "printer.paper-near-end": {
    what: "Paper low",
    todo: "Have a new roll ready.",
  },
  "printer.cover-open": {
    what: "Cover open",
    todo: "Close the printer cover.",
  },
  "booth.silent": {
    what: "Silent booth",
    todo: "No news for 3 minutes: check its power and network.",
  },
};

export function composeMessage(
  alert: AlertForPush,
  event: AlertEvent,
): PushMessage {
  const { what, todo } = WORDING[alert.key] ?? { what: alert.key, todo: "" };
  const common = {
    tag: alert.id,
    url: `/alerts/${alert.id}`,
    event,
    severity: alert.severity,
  };
  if (event === "resolved") {
    return {
      ...common,
      title: `${alert.boothName}: back to normal`,
      body: `${what} is fixed.`,
    };
  }
  return {
    ...common,
    title: `${alert.boothName}: ${what}`,
    body: event === "reminder" ? `Still: ${todo}` : todo,
  };
}
