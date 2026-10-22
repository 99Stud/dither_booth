import type { PrinterCondition } from "@dither-booth/protocol/heartbeat";

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

/** The glossary's words for what the printer reports. */
export const CONDITION_LABEL: Record<PrinterCondition, string> = {
  "paper-near-end": "Paper low",
  "paper-out": "Out of paper",
  "cover-open": "Cover open",
  error: "Printer error",
  disconnected: "Not connected",
  unknown: "Checking",
};

/** A booth that hasn't reported for this long is silent. */
export const SILENT_AFTER_MS = 3 * 60_000;

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
    const heartbeat = status?.heartbeat as
      | {
          release?: string;
          printer?: { conditions?: PrinterCondition[] };
          maintenance?: { on?: boolean };
        }
      | undefined;
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
            conditions: heartbeat?.printer?.conditions ?? [],
            maintenance: heartbeat?.maintenance?.on ?? false,
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

/** When the booth's event is on: its silence is an incident then, never outside. */
export async function setLiveWindow(
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

/** A one-time code to type in the booth's admin (Settings, Hub). */
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

/** How the booth is doing, from its last report. */
export function reportLine(
  booth: BoothRow,
  now: number,
): { text: string; tone: "ok" | "warn" | "off" } {
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
