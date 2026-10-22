import type { AlertKey, AlertSeverity } from "@dither-booth/protocol/alerts";

import { hub } from "./hub";

export type AlertRow = {
  id: string;
  boothId: string;
  boothName: string;
  key: AlertKey;
  severity: AlertSeverity;
  openedAt: string;
  resolvedAt: string | null;
  ackedAt: string | null;
};

/** How far back Studio shows closed alerts. */
const HISTORY_HOURS = 24;

/** Open alerts, and those closed in the last day, newest first. */
export async function listAlerts(now = new Date()): Promise<AlertRow[]> {
  const since = new Date(
    now.getTime() - HISTORY_HOURS * 3_600_000,
  ).toISOString();
  const [alerts, booths] = await Promise.all([
    hub
      .from("alert")
      .select("id, booth_id, key, severity, opened_at, resolved_at, acked_at")
      .or(`resolved_at.is.null,resolved_at.gte.${since}`)
      .order("opened_at", { ascending: false })
      .limit(100),
    hub.from("booth").select("id, name"),
  ]);
  if (alerts.error) throw alerts.error;
  if (booths.error) throw booths.error;
  const names = new Map(
    (booths.data ?? []).map((booth) => [booth.id, booth.name]),
  );
  return (alerts.data ?? []).map((alert) => ({
    id: alert.id,
    boothId: alert.booth_id,
    boothName: names.get(alert.booth_id) ?? "A booth",
    // The Hub only stores known keys (alert_key_known).
    key: alert.key as AlertKey,
    severity: alert.severity,
    openedAt: alert.opened_at,
    resolvedAt: alert.resolved_at,
    ackedAt: alert.acked_at,
  }));
}

/** Open first (critical before warnings, newest first), then the closed ones. */
export function sortAlerts(alerts: AlertRow[]): {
  open: AlertRow[];
  closed: AlertRow[];
} {
  const open = alerts
    .filter((alert) => alert.resolvedAt === null)
    .sort(
      (a, b) =>
        Number(b.severity === "critical") - Number(a.severity === "critical") ||
        b.openedAt.localeCompare(a.openedAt),
    );
  const closed = alerts
    .filter((alert) => alert.resolvedAt !== null)
    .sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""));
  return { open, closed };
}

/** Open alerts nobody acknowledged yet, most urgent first: the banner's. */
export const waitingAlerts = (alerts: AlertRow[]): AlertRow[] =>
  sortAlerts(alerts).open.filter((alert) => !alert.ackedAt);

/** "I'm on it": stops the reminders. The Hub records who. */
export async function acknowledge(alertId: string): Promise<void> {
  // Row level security turns a refused update into no rows, not an error.
  const { data, error } = await hub
    .from("alert")
    .update({ acked_at: new Date().toISOString() })
    .eq("id", alertId)
    .select("id");
  if (error) throw error;
  if (!data?.length) {
    throw new Error("The Hub didn't take it. Reload, then try again.");
  }
}
