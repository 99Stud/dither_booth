import { registrationSchema } from "@dither-booth/protocol/registration";
import { TRPCError } from "@trpc/server";

import type { DbExecutor } from "#db/internal/db.types";

import { hubLinkTable } from "#db/internal/db.schema";

import type { HubEndpoint } from "./hub.constants";

export type HubLinkStatus =
  | { linked: false }
  | {
      linked: true;
      hubUrl: string;
      boothId: string;
      boothName: string;
      /** ISO 8601. */
      linkedAt: string;
    };

/** Whether the booth is registered with the Hub, and as which booth. */
export function readHubLink(db: DbExecutor): HubLinkStatus {
  const row = db.select().from(hubLinkTable).get();
  if (!row) return { linked: false };
  return {
    linked: true,
    hubUrl: row.hubUrl,
    boothId: row.boothId,
    boothName: row.boothName,
    linkedAt: row.linkedAt.toISOString(),
  };
}

/**
 * Registers the booth with the Hub: trades a one-time code, issued by staff
 * on the Hub, for the booth's own session, and keeps it. Registering again
 * replaces the link (and, on the Hub, ends the previous session).
 */
export async function linkToHub(
  deps: {
    db: DbExecutor;
    hub: HubEndpoint;
    fetch?: typeof fetch;
    now?: () => Date;
  },
  code: string,
): Promise<HubLinkStatus> {
  const { db, hub, fetch: fetchFn = fetch, now = () => new Date() } = deps;

  let res: Response;
  try {
    res = await fetchFn(`${hub.url}/functions/v1/register-booth`, {
      method: "POST",
      headers: {
        apikey: hub.publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (cause) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message:
        "The booth can't reach the Hub. Connect it to the internet and try again.",
      cause,
    });
  }

  if (res.status === 404) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message:
        "This code is unknown, already used or expired. Ask for a new one.",
    });
  }
  const parsed = res.ok
    ? registrationSchema.safeParse(await res.json().catch(() => null))
    : null;
  if (!parsed?.success) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `The Hub couldn't register the booth (HTTP ${res.status}). Ask for a new code and try again.`,
    });
  }

  const link = {
    hubUrl: hub.url,
    boothId: parsed.data.booth.id,
    boothName: parsed.data.booth.name,
    refreshToken: parsed.data.session.refreshToken,
    linkedAt: now(),
  };
  db.insert(hubLinkTable)
    .values({ id: 1, ...link })
    .onConflictDoUpdate({ target: hubLinkTable.id, set: link })
    .run();

  return readHubLink(db);
}

/** Forgets the link on this booth. The Hub keeps the booth for a new code. */
export function unlinkFromHub(db: DbExecutor): void {
  db.delete(hubLinkTable).run();
}
