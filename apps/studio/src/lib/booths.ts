import type {
  Heartbeat,
  PrinterCondition,
} from "@dither-booth/protocol/heartbeat";

import { SILENT_AFTER_MS } from "@dither-booth/protocol/alerts";
import { format, formatDistanceToNowStrict } from "date-fns";

import { hub } from "./hub";

export type BoothRow = {
  id: string;
  orgId: string;
  name: string;
  liveFrom: string | null;
  liveUntil: string | null;
  registeredAt: string | null;
  status: {
    lastSeenAt: string;
    dryRun: boolean;
    conditions: PrinterCondition[];
    maintenance: boolean;
    release: string;
  } | null;
};

export async function listBooths(): Promise<BoothRow[]> {
  const [booths, statuses] = await Promise.all([
    hub
      .from("booth")
      .select("id, org_id, name, live_from, live_until, registered_at")
      .order("name"),
    hub
      .from("booth_status")
      .select("booth_id, last_seen_at, heartbeat, dry_run"),
  ]);
  if (booths.error) throw booths.error;
  if (statuses.error) throw statuses.error;
  const byBooth = new Map(
    (statuses.data ?? []).map((status) => [status.booth_id, status]),
  );
  return (booths.data ?? []).map((booth) => {
    const status = byBooth.get(booth.id);
    // The heartbeat Edge Function stored it after checking it against the schema.
    const heartbeat = status?.heartbeat as Heartbeat | undefined;
    return {
      id: booth.id,
      orgId: booth.org_id,
      name: booth.name,
      liveFrom: booth.live_from,
      liveUntil: booth.live_until,
      registeredAt: booth.registered_at,
      status: status
        ? {
            lastSeenAt: status.last_seen_at,
            dryRun: status.dry_run,
            conditions: heartbeat?.printer.conditions ?? [],
            maintenance: heartbeat?.maintenance.on ?? false,
            release: heartbeat?.release ?? "",
          }
        : null,
    };
  });
}

export async function addBooth(orgId: string, name: string): Promise<void> {
  const { error } = await hub
    .from("booth")
    .insert({ org_id: orgId, name: name.trim() });
  if (error) throw error;
}

/** The booth's event times: its silence is an alert then, never outside. */
export async function setEventTimes(
  boothId: string,
  from: string | null,
  until: string | null,
): Promise<void> {
  const { error } = await hub
    .from("booth")
    .update({ live_from: from, live_until: until })
    .eq("id", boothId);
  if (error) throw error;
}

export type RegistrationCode = {
  boothName: string;
  code: string;
  expiresAt: string;
};

/** A one-time code to type in the booth's admin (Settings → Hub). */
export async function issueRegistrationCode(
  boothId: string,
): Promise<RegistrationCode> {
  const { data, error } = await hub.functions.invoke<RegistrationCode>(
    "booth-code",
    {
      method: "POST",
      body: { boothId },
    },
  );
  if (error) throw error;
  if (!data) throw new Error("The Hub gave no code.");
  return data;
}

export type ReportTone = "ok" | "warn" | "off";

/** How the booth is doing, from its last report. */
export function reportLine(
  booth: BoothRow,
  now: number,
): { text: string; tone: ReportTone } {
  if (!booth.registeredAt) return { text: "Not registered yet.", tone: "off" };
  if (!booth.status) return { text: "Registered, no report yet.", tone: "off" };
  const seen = new Date(booth.status.lastSeenAt);
  if (now - seen.getTime() > SILENT_AFTER_MS) {
    return { text: `Silent since ${format(seen, "EEE HH:mm")}.`, tone: "warn" };
  }
  return {
    text: `Reported ${formatDistanceToNowStrict(seen, { addSuffix: true })}.`,
    tone: "ok",
  };
}
