import { heartbeatSchema } from "@dither-booth/protocol/heartbeat";
import { afterEach, describe, expect, test } from "bun:test";

import type { PrinterStatus } from "#domains/printer/printer.service";

import { hubRegistrationTable } from "#db/internal/db.schema";
import { createTestDb } from "#db/internal/db.test-utils";
import { waitFor } from "#domains/printer/internal/printer.test-utils";

import { readHubRegistration } from "./hub-registration.service";
import { createHubReporter, type HubReporter } from "./hub-reporter";

const HUB = { url: "https://hub.test", publishableKey: "pk" };
const NOW = new Date("2026-10-31T18:00:00.000Z");
const NOW_S = NOW.getTime() / 1000;

const READY: PrinterStatus = {
  canPrint: true,
  changedAt: "2026-10-31T17:00:00.000Z",
  checkedAt: "2026-10-31T18:00:00.000Z",
  conditions: [],
  history: [],
  lastError: null,
  offline: false,
  raw: null,
};

const reporters: HubReporter[] = [];
afterEach(() => {
  for (const reporter of reporters.splice(0)) reporter.stop();
});

/** A Hub that renews sessions and takes heartbeats, unless told otherwise. */
function fakeHub() {
  let refreshes = 0;
  const heartbeats: { auth: string | null; body: unknown }[] = [];
  const answers = {
    token: (): Response =>
      Response.json({
        access_token: `access-${refreshes}`,
        refresh_token: `refresh-${refreshes + 1}`,
        expires_at: NOW_S + 3600,
      }),
    heartbeat: (): Response => Response.json({ ok: true }),
  };
  const hubFetch = (async (url: string, init: RequestInit) => {
    if (url.includes("/auth/v1/token")) {
      const res = answers.token();
      if (res.ok) refreshes += 1;
      return res;
    }
    heartbeats.push({
      auth: new Headers(init.headers).get("Authorization"),
      body: JSON.parse(String(init.body)),
    });
    return answers.heartbeat();
  }) as unknown as typeof fetch;
  return { fetch: hubFetch, heartbeats, answers, refreshes: () => refreshes };
}

function setup({
  registered = true,
  dryRun = false,
  intervalMs = 60_000,
} = {}) {
  const { db } = createTestDb();
  if (registered) {
    db.insert(hubRegistrationTable)
      .values({
        id: 1,
        hubUrl: HUB.url,
        boothId: "0f3e9c7a-5b1d-4c2e-8a6f-1d2c3b4a5e6f",
        boothName: "Booth A",
        refreshToken: "refresh-0",
        registeredAt: NOW,
      })
      .run();
  }
  const hub = fakeHub();
  let status = READY;
  const listeners = new Set<(s: PrinterStatus) => void>();
  const reporter = createHubReporter({
    db,
    hub: HUB,
    printer: {
      getStatus: () => status,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    maintenance: {
      get: () => ({
        enabled: false,
        reasons: [],
        manual: false,
        printerFault: false,
        automatic: true,
        updatedAt: null,
      }),
    },
    release: "0.7.0",
    dryRun,
    log: () => {},
    intervalMs,
    fetch: hub.fetch,
    now: () => NOW,
  });
  reporters.push(reporter);
  return {
    db,
    hub,
    reporter,
    setPrinter(next: PrinterStatus) {
      status = next;
      for (const listener of listeners) listener(next);
    },
  };
}

const storedRefreshToken = (db: ReturnType<typeof createTestDb>["db"]) =>
  db.select().from(hubRegistrationTable).get()?.refreshToken;

describe("hub reporter", () => {
  test("does nothing while the booth isn't registered", async () => {
    const { hub, reporter } = setup({ registered: false });
    await reporter.report();
    expect(hub.refreshes()).toBe(0);
    expect(hub.heartbeats).toHaveLength(0);
  });

  test("renews the session, keeps the next refresh token, and reports", async () => {
    const { db, hub, reporter } = setup();
    await reporter.report();

    expect(storedRefreshToken(db)).toBe("refresh-1");
    expect(hub.heartbeats[0]?.auth).toBe("Bearer access-0");
    const sent = heartbeatSchema.parse(hub.heartbeats[0]?.body);
    expect(sent).toMatchObject({
      release: "0.7.0",
      dryRun: false,
      printer: { conditions: [], canPrint: true },
    });
    expect(reporter.getState()).toEqual({
      lastReportedAt: NOW.toISOString(),
      lastError: null,
    });
  });

  test("uses the access token until it nears expiry", async () => {
    const { hub, reporter } = setup();
    await reporter.report();
    await reporter.report();
    expect(hub.refreshes()).toBe(1);
    expect(hub.heartbeats).toHaveLength(2);
  });

  test("a refused session forgets the registration", async () => {
    const { db, hub, reporter } = setup();
    hub.answers.token = () =>
      Response.json({ error: "invalid_grant" }, { status: 400 });
    await reporter.report();

    expect(readHubRegistration(db)).toEqual({ registered: false });
    expect(hub.heartbeats).toHaveLength(0);
    expect(reporter.getState().lastError).toContain("Register again");
  });

  test("a refused access token is renewed on the next report", async () => {
    const { hub, reporter } = setup();
    hub.answers.heartbeat = () =>
      Response.json({ error: "invalid token" }, { status: 401 });
    await reporter.report();
    hub.answers.heartbeat = () => Response.json({ ok: true });
    await reporter.report();

    expect(hub.refreshes()).toBe(2);
    expect(hub.heartbeats.at(-1)?.auth).toBe("Bearer access-1");
    expect(reporter.getState().lastError).toBeNull();
  });

  test("a booth the Hub no longer has forgets its registration", async () => {
    const { db, hub, reporter } = setup();
    hub.answers.heartbeat = () =>
      Response.json({ error: "unknown booth" }, { status: 404 });
    await reporter.report();
    expect(readHubRegistration(db)).toEqual({ registered: false });
  });

  test("a Hub that can't be reached keeps the registration and says why", async () => {
    const { db, hub, reporter } = setup();
    hub.answers.heartbeat = () =>
      Response.json({ error: "boom" }, { status: 503 });
    await reporter.report();
    expect(readHubRegistration(db).registered).toBe(true);
    expect(reporter.getState().lastError).toBe("The Hub answered HTTP 503.");
  });

  test("reports at once when the printer's conditions change", async () => {
    const { hub, reporter, setPrinter } = setup();
    reporter.start();
    await waitFor(() => hub.heartbeats.length === 1);

    setPrinter({
      ...READY,
      conditions: ["paper-out"],
      canPrint: false,
      changedAt: NOW.toISOString(),
    });
    await waitFor(() => hub.heartbeats.length === 2);
    expect(
      heartbeatSchema.parse(hub.heartbeats[1]?.body).printer.conditions,
    ).toEqual(["paper-out"]);

    // A status that changes nothing that matters sends nothing more.
    setPrinter({
      ...READY,
      conditions: ["paper-out"],
      canPrint: false,
      changedAt: NOW.toISOString(),
      checkedAt: "later",
    });
    await Bun.sleep(20);
    expect(hub.heartbeats).toHaveLength(2);
  });

  test("reports every interval", async () => {
    const { hub, reporter } = setup({ intervalMs: 10 });
    reporter.start();
    await waitFor(() => hub.heartbeats.length >= 3);
  });

  test("a dry-run booth says so, and a printer with no status yet reports as of now", async () => {
    const { hub, reporter, setPrinter } = setup({ dryRun: true });
    setPrinter({
      ...READY,
      conditions: ["unknown"],
      canPrint: false,
      changedAt: "",
    });
    await reporter.report();
    const sent = heartbeatSchema.parse(hub.heartbeats[0]?.body);
    expect(sent.dryRun).toBe(true);
    expect(sent.printer.changedAt).toBe(NOW.toISOString());
  });
});
