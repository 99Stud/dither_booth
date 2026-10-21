import {
  type Heartbeat,
  heartbeatSchema,
  PROTOCOL_VERSION,
} from "@dither-booth/protocol/heartbeat";
import { getErrorMessage } from "@dither-booth/shared/errors";
import { eq } from "drizzle-orm";

import type { DbExecutor } from "#db/internal/db.types";
import type { KioskMaintenance } from "#domains/kiosk/kiosk.service";
import type {
  BoothPrinter,
  PrinterStatus,
} from "#domains/printer/printer.service";

import { hubRegistrationTable } from "#db/internal/db.schema";

import type { HubEndpoint } from "./hub.constants";

import { forgetRegistration } from "./hub-registration.service";

/** What admin shows about the booth's reports to the Hub. */
export type HubReportState = {
  /** ISO 8601, or null before the first one. */
  lastReportedAt: string | null;
  /** Why the last attempt failed, or null if it didn't. */
  lastError: string | null;
};

type Log = (
  level: "info" | "warn" | "error",
  event: string,
  details?: Record<string, unknown>,
) => void;

type Session = { boothId: string; accessToken: string; expiresAt: number };

/** An access token this close to expiry is renewed first. */
const RENEW_BEFORE_S = 60;

const sameConditions = (a: PrinterStatus, b: PrinterStatus) =>
  a.canPrint === b.canPrint && a.conditions.join() === b.conditions.join();

/**
 * Tells the Hub how the booth is doing: a heartbeat every `intervalMs`, and
 * one as soon as the printer's conditions change, so an alert doesn't wait
 * for the next tick. Does nothing while the booth isn't registered.
 *
 * The booth's session lives here. The access token stays in memory; the
 * refresh token is single use, so each new one is stored before the access
 * token that came with it is used. When the Hub refuses the session (the
 * booth was registered again elsewhere, or removed) the registration is
 * forgotten, as admin then shows it.
 */
export function createHubReporter(deps: {
  db: DbExecutor;
  hub: HubEndpoint;
  printer: Pick<BoothPrinter, "getStatus" | "subscribe">;
  maintenance: Pick<KioskMaintenance, "get">;
  release: string;
  dryRun: boolean;
  log: Log;
  intervalMs?: number;
  fetch?: typeof fetch;
  now?: () => Date;
}) {
  const {
    db,
    hub,
    printer,
    maintenance,
    log,
    intervalMs = 30_000,
    fetch: fetchFn = fetch,
    now = () => new Date(),
  } = deps;
  const state: HubReportState = { lastReportedAt: null, lastError: null };
  let session: Session | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let sending: Promise<void> | null = null;
  let sendAgain = false;
  let lastSentPrinter: PrinterStatus | null = null;
  let unsubscribe: (() => void) | undefined;

  const headers = (extra: Record<string, string> = {}) => ({
    apikey: hub.publishableKey,
    "Content-Type": "application/json",
    ...extra,
  });

  const fail = (message: string) => {
    if (state.lastError !== message) {
      log("warn", "hub-report-failed", { error: message });
    }
    state.lastError = message;
  };

  /** A valid access token, renewed if needed, or null if not registered. */
  async function accessToken(): Promise<string | null> {
    const registration = db.select().from(hubRegistrationTable).get();
    if (!registration) {
      session = null;
      return null;
    }
    const nowS = now().getTime() / 1000;
    if (
      session &&
      session.boothId === registration.boothId &&
      session.expiresAt - RENEW_BEFORE_S > nowS
    ) {
      return session.accessToken;
    }

    const res = await fetchFn(
      `${hub.url}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ refresh_token: registration.refreshToken }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (res.status === 400 || res.status === 401) {
      session = null;
      forgetRegistration(db);
      log("error", "hub-registration-revoked", {
        boothId: registration.boothId,
        status: res.status,
      });
      throw new Error(
        "The Hub no longer knows this registration. Register again with a new code.",
      );
    }
    if (!res.ok)
      throw new Error(`Couldn't renew the session (HTTP ${res.status}).`);

    const body = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_at?: number;
    };
    if (!body.access_token || !body.refresh_token || !body.expires_at) {
      throw new Error("The Hub's session answer was incomplete.");
    }
    // Stored before anything else: the old refresh token is now spent.
    db.update(hubRegistrationTable)
      .set({ refreshToken: body.refresh_token })
      .where(eq(hubRegistrationTable.id, 1))
      .run();
    session = {
      boothId: registration.boothId,
      accessToken: body.access_token,
      expiresAt: body.expires_at,
    };
    return session.accessToken;
  }

  function heartbeat(status: PrinterStatus): Heartbeat {
    const { enabled, reasons } = maintenance.get();
    return heartbeatSchema.parse({
      protocol: PROTOCOL_VERSION,
      release: deps.release,
      dryRun: deps.dryRun,
      sentAt: now().toISOString(),
      printer: {
        conditions: status.conditions,
        canPrint: status.canPrint,
        // No status yet (connecting, dry run): as of now.
        changedAt: status.changedAt || now().toISOString(),
      },
      maintenance: { on: enabled, reasons },
    });
  }

  async function sendOnce(): Promise<void> {
    const token = await accessToken();
    if (!token) return;

    const status = printer.getStatus();
    const res = await fetchFn(`${hub.url}/functions/v1/heartbeat`, {
      method: "POST",
      headers: headers({ Authorization: `Bearer ${token}` }),
      body: JSON.stringify(heartbeat(status)),
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 401) {
      // Renewed on the next attempt.
      session = null;
      throw new Error("The Hub refused the session; renewing it.");
    }
    if (res.status === 404) {
      forgetRegistration(db);
      session = null;
      throw new Error(
        "The Hub no longer has this booth. Register again with a new code.",
      );
    }
    if (!res.ok) throw new Error(`The Hub answered HTTP ${res.status}.`);

    lastSentPrinter = status;
    if (state.lastError) log("info", "hub-report-recovered");
    state.lastReportedAt = now().toISOString();
    state.lastError = null;
  }

  /** One report at a time; a change during one sends another after it. */
  function report(): Promise<void> {
    if (sending) {
      sendAgain = true;
      return sending;
    }
    sending = sendOnce()
      .catch((error: unknown) => fail(getErrorMessage(error)))
      .finally(() => {
        sending = null;
        if (sendAgain && running) {
          sendAgain = false;
          void report();
        }
      });
    return sending;
  }

  function schedule() {
    if (!running) return;
    timer = setTimeout(() => {
      void report().finally(schedule);
    }, intervalMs);
  }

  return {
    start() {
      if (running) return;
      running = true;
      unsubscribe = printer.subscribe((status) => {
        if (!lastSentPrinter || !sameConditions(lastSentPrinter, status)) {
          void report();
        }
      });
      void report();
      schedule();
    },
    stop() {
      running = false;
      clearTimeout(timer);
      unsubscribe?.();
    },
    /** Sends now, for instance right after registering. */
    report,
    getState: (): HubReportState => ({ ...state }),
  };
}

export type HubReporter = ReturnType<typeof createHubReporter>;
