import type {
  Heartbeat,
  PrinterCondition,
} from "@dither-booth/protocol/heartbeat";

import { SILENT_AFTER_MS } from "@dither-booth/protocol/alerts";
import { format, formatDistanceToNowStrict } from "date-fns";

import { hub } from "./hub";

/** An update staff asked for, and how the booth says it goes. */
export type BoothUpdateRequest = {
  release: string;
  state:
    | "requested"
    | "waiting"
    | "running"
    | "done"
    | "failed"
    | "rolled-back";
  stateAt: string;
  error: string | null;
};

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
  update: BoothUpdateRequest | null;
};

export async function listBooths(): Promise<BoothRow[]> {
  const [booths, statuses, updates] = await Promise.all([
    hub
      .from("booth")
      .select("id, org_id, name, live_from, live_until, registered_at")
      .order("name"),
    hub
      .from("booth_status")
      .select("booth_id, last_seen_at, heartbeat, dry_run"),
    hub
      .from("booth_update")
      .select("booth_id, release, state, state_at, error"),
  ]);
  if (booths.error) throw booths.error;
  if (statuses.error) throw statuses.error;
  if (updates.error) throw updates.error;
  const byBooth = new Map(
    (statuses.data ?? []).map((status) => [status.booth_id, status]),
  );
  const updateByBooth = new Map(
    (updates.data ?? []).map((update) => [update.booth_id, update]),
  );
  return (booths.data ?? []).map((booth) => {
    const status = byBooth.get(booth.id);
    // The heartbeat Edge Function stored it after checking it against the schema.
    const heartbeat = status?.heartbeat as Heartbeat | undefined;
    const update = updateByBooth.get(booth.id);
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
      update: update
        ? {
            release: update.release,
            // The table's check constraint keeps it to these.
            state: update.state as BoothUpdateRequest["state"],
            stateAt: update.state_at,
            error: update.error,
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

/**
 * Asks the booth to install `release`. It hears about it in its next
 * heartbeat's answer and installs it when it's quiet. Asking again starts
 * over.
 */
export async function requestUpdate(
  booth: Pick<BoothRow, "id" | "orgId">,
  release: string,
): Promise<void> {
  const inserted = await hub
    .from("booth_update")
    .insert({ booth_id: booth.id, org_id: booth.orgId, release });
  // Already asked once: staff may only change the release, which restarts it.
  if (inserted.error?.code === "23505") {
    const { error } = await hub
      .from("booth_update")
      .update({ release })
      .eq("booth_id", booth.id);
    if (error) throw error;
    return;
  }
  if (inserted.error) throw inserted.error;
}

/** Forgets the request; a booth already updating carries on. */
export async function cancelUpdate(boothId: string): Promise<void> {
  const { error } = await hub
    .from("booth_update")
    .delete()
    .eq("booth_id", boothId);
  if (error) throw error;
}

/** How the update staff asked for goes, in a line; null when there is none. */
export function updateLine(booth: BoothRow): string | null {
  const { update } = booth;
  if (!update) return null;
  const why = update.error ? ` ${update.error}` : "";
  switch (update.state) {
    case "requested":
      return `Asked to update to ${update.release}. It hears about it in its next report.`;
    case "waiting":
      return `Waiting to update to ${update.release}.${why}`;
    case "running":
      return `Updating to ${update.release}.`;
    case "done":
      return `Updated to ${update.release} ${formatDistanceToNowStrict(new Date(update.stateAt), { addSuffix: true })}.`;
    case "failed":
      return `The update to ${update.release} stopped; nothing changed.${why}`;
    case "rolled-back":
      return `${update.release} didn't start, so the booth went back.${why}`;
  }
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
