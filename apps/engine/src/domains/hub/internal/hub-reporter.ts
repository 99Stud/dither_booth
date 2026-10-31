import type { LotteryStatus } from "@dither-booth/shared/lottery";

import {
  type BoothUpdateReport,
  type Heartbeat,
  type HeartbeatLottery,
  heartbeatReplySchema,
  heartbeatSchema,
  PROTOCOL_VERSION,
} from "@dither-booth/protocol/heartbeat";
import { getErrorMessage } from "@dither-booth/shared/errors";
import { eq } from "drizzle-orm";

import type { DbExecutor } from "#db/internal/db.types";
import type {
  KioskCamera,
  KioskCameraState,
  KioskMaintenance,
} from "#domains/kiosk/kiosk.service";
import type {
  BoothPrinter,
  PrinterStatus,
} from "#domains/printer/printer.service";

import { hubRegistrationTable } from "#db/internal/db.schema";

import type { RemoteUpdates } from "./hub-updates";
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
 * Live with every prize out: what the Hub's Lottery empty alert is about
 * (`v_lottery_empty` in its `evaluate_heartbeat`).
 */
const isLotteryEmpty = (lottery: HeartbeatLottery) =>
  lottery.live && lottery.stockLeft === 0;

/**
 * Tells the Hub how the booth is doing: a heartbeat every `intervalMs`, and
 * one as soon as the printer's conditions change, the camera goes off or
 * comes back, or the lottery runs out or has prizes again
 * (`lotteryChanged`), so an alert doesn't wait for the next tick. Does
 * nothing while the booth isn't registered.
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
  /** The booth camera, as the kiosk pages report it. */
  camera: Pick<KioskCamera, "get" | "subscribe">;
  /** The active event's lottery, as admin's lottery status reads it. */
  getLotteryStatus: () => Promise<
    Pick<LotteryStatus, "enabled" | "remainingPrizes">
  >;
  release: string;
  dryRun: boolean;
  /** Updates Studio asks for, through the heartbeat's answer. */
  updates?: RemoteUpdates;
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
    camera,
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
  let lastSentLottery: HeartbeatLottery | null = null;
  const unsubscribes: Array<() => void> = [];

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

  /**
   * Null when it can't be read: the heartbeat then goes without it, so the
   * printer's news and proof of life still reach the Hub.
   */
  async function readLottery(): Promise<HeartbeatLottery | null> {
    try {
      const { enabled, remainingPrizes } = await deps.getLotteryStatus();
      return { live: enabled, stockLeft: remainingPrizes };
    } catch (error) {
      log("warn", "hub-lottery-read-failed", {
        error: getErrorMessage(error),
      });
      return null;
    }
  }

  function heartbeat(
    status: PrinterStatus,
    cameraState: KioskCameraState,
    lottery: HeartbeatLottery | null,
    update: BoothUpdateReport | undefined,
  ): Heartbeat {
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
      camera: {
        ready: cameraState.ready,
        changedAt: cameraState.changedAt.toISOString(),
      },
      ...(lottery ? { lottery } : {}),
      ...(update ? { update } : {}),
    });
  }

  async function sendOnce(): Promise<void> {
    const token = await accessToken();
    if (!token) return;

    const status = printer.getStatus();
    const cameraState = camera.get();
    const lottery = await readLottery();
    const update = await deps.updates?.report();
    const res = await fetchFn(`${hub.url}/functions/v1/heartbeat`, {
      method: "POST",
      headers: headers({ Authorization: `Bearer ${token}` }),
      body: JSON.stringify(heartbeat(status, cameraState, lottery, update)),
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
    lastSentLottery = lottery;
    if (state.lastError) log("info", "hub-report-recovered");

    // A Hub from before updates answers without one.
    const reply = heartbeatReplySchema.safeParse(
      await res.json().catch(() => undefined),
    );
    const requested = reply.success ? reply.data.update?.release : undefined;
    if (requested && deps.updates) {
      await deps.updates.request(requested).catch((error: unknown) => {
        log("warn", "hub-update-request-failed", {
          error: getErrorMessage(error),
        });
      });
    }
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
      unsubscribes.push(
        printer.subscribe((status) => {
          if (!lastSentPrinter || !sameConditions(lastSentPrinter, status)) {
            void report();
          }
        }),
        // Every flip matters: off starts the Hub's grace period, back closes
        // the alert.
        camera.subscribe(() => void report()),
      );
      void report();
      schedule();
    },
    stop() {
      running = false;
      clearTimeout(timer);
      for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
    },
    /** Sends now, for instance right after registering. */
    report,
    /**
     * After the lottery changed (its settings, prizes or stock, or a win):
     * sends now if it ran out or has prizes again since the last heartbeat.
     */
    async lotteryChanged(): Promise<void> {
      const lottery = await readLottery();
      if (!lottery) return;
      if (
        !lastSentLottery ||
        isLotteryEmpty(lottery) !== isLotteryEmpty(lastSentLottery)
      ) {
        await report();
      }
    },
    getState: (): HubReportState => ({ ...state }),
  };
}

export type HubReporter = ReturnType<typeof createHubReporter>;
