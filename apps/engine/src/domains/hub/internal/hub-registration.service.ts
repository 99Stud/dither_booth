import { registrationSchema } from "@dither-booth/protocol/registration";
import { TRPCError } from "@trpc/server";

import type { DbExecutor } from "#db/internal/db.types";

import { hubRegistrationTable } from "#db/internal/db.schema";

import type { HubEndpoint } from "./hub.constants";

/** The booth on the Hub, as admin shows it. Never the refresh token. */
export type HubRegistration = {
  hubUrl: string;
  boothId: string;
  boothName: string;
  /** ISO 8601. */
  registeredAt: string;
};

export type HubRegistrationStatus =
  | { registered: false }
  | ({ registered: true } & HubRegistration);

const toRegistration = (
  row: typeof hubRegistrationTable.$inferSelect,
): HubRegistration => ({
  hubUrl: row.hubUrl,
  boothId: row.boothId,
  boothName: row.boothName,
  registeredAt: row.registeredAt.toISOString(),
});

/** Whether the booth is registered with the Hub, and as which booth. */
export function readHubRegistration(db: DbExecutor): HubRegistrationStatus {
  const row = db.select().from(hubRegistrationTable).get();
  return row
    ? { registered: true, ...toRegistration(row) }
    : { registered: false };
}

/** Forgets the registration here. The Hub keeps the booth for a new code. */
export function forgetRegistration(db: DbExecutor): void {
  db.delete(hubRegistrationTable).run();
}

/**
 * Registers the booth with the Hub: trades a one-time code for the booth's
 * own session, and keeps it.
 *
 * A code the Hub refuses changes nothing here. Any other failure (no answer,
 * an error, an answer that makes no sense) may come after the Hub already
 * replaced this booth's registration, ending the session kept here: so it is
 * forgotten, and admin asks for a new code instead of showing a dead link.
 */
export async function registerBooth(
  deps: {
    db: DbExecutor;
    hub: HubEndpoint;
    fetch?: typeof fetch;
    now?: () => Date;
  },
  code: string,
): Promise<HubRegistration> {
  const { db, hub, fetch: fetchFn = fetch, now = () => new Date() } = deps;

  const unfinished = (reason: string, cause?: unknown) => {
    forgetRegistration(db);
    return new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: `Registering didn't finish: ${reason}. Ask for a new code and register again.`,
      cause,
    });
  };

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
    throw unfinished("the booth couldn't reach the Hub", cause);
  }

  if (res.status === 404) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message:
        "This code is unknown, already used or expired. Ask for a new one.",
    });
  }
  if (res.status === 400) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The Hub doesn't read this as a code. Check it and try again.",
    });
  }

  const parsed = res.ok
    ? registrationSchema.safeParse(await res.json().catch(() => null))
    : null;
  if (!parsed?.success) {
    throw unfinished(`the Hub answered HTTP ${res.status}`);
  }

  const row = {
    hubUrl: hub.url,
    boothId: parsed.data.booth.id,
    boothName: parsed.data.booth.name,
    refreshToken: parsed.data.session.refreshToken,
    registeredAt: now(),
  };
  db.insert(hubRegistrationTable)
    .values({ id: 1, ...row })
    .onConflictDoUpdate({ target: hubRegistrationTable.id, set: row })
    .run();

  return toRegistration({ id: 1, ...row });
}
