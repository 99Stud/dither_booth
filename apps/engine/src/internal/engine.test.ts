import { describe, expect, test } from "bun:test";

import type { PuppeteerReceiptViewerLifecycle } from "#lib/puppeteer/puppeteer.types";

import { createTestDb } from "#db/internal/db.test-utils";
import { createStubPrinter } from "#domains/printer/internal/printer.test-utils";
import { createInitialPuppeteerState } from "#lib/puppeteer/puppeteer.utils";

import { createEngine, type EngineDeps } from "./engine";

/**
 * An engine on fakes that write what happens to them into `events`. The
 * printer has two subscribers, in this order: the printer maintenance policy,
 * then the Hub reporter.
 */
function setup(overrides: Partial<EngineDeps> = {}) {
  const events: string[] = [];
  const subscribers = ["maintenance-policy", "hub-reporter"];
  let subscriptions = 0;

  const printer = createStubPrinter();
  printer.start = () => {
    events.push("printer.start");
  };
  printer.stop = async () => {
    events.push("printer.stop");
  };
  printer.subscribe = () => {
    const subscriber = subscribers[subscriptions++] ?? "unknown";
    events.push(`${subscriber}.start`);
    return () => events.push(`${subscriber}.stop`);
  };

  const state = createInitialPuppeteerState();
  const browser: PuppeteerReceiptViewerLifecycle = {
    initialize: async () => {
      events.push("browser.initialize");
      return { state };
    },
    close: async () => {
      events.push("browser.close");
    },
    getCurrent: () => ({ state }),
    restart: async () => ({ ok: true, state }),
    whenReady: async () => ({ state }),
  };

  const engine = createEngine({
    db: createTestDb().db,
    mode: "development",
    printer,
    browser,
    hub: { url: "https://hub.invalid", publishableKey: "test" },
    release: "test",
    adminOrigin: "https://admin.local",
    allowedHostnames: [],
    setupServerAccess: { verify: () => false },
    processManager: "unknown",
    nmcli: async () => {
      throw new Error("nmcli is not set up for this test.");
    },
    ...overrides,
  });

  return { engine, events, browser };
}

describe("createEngine", () => {
  test("starts the browser before the printer, and stops in reverse", async () => {
    const { engine, events } = setup();

    await engine.start();
    await engine.stop();

    expect(events).toEqual([
      "browser.initialize",
      "printer.start",
      "maintenance-policy.start",
      "hub-reporter.start",
      "hub-reporter.stop",
      "browser.close",
      "maintenance-policy.stop",
      "printer.stop",
    ]);
  });

  test("a failed step doesn't stop the ones after it", async () => {
    const { engine, events, browser } = setup();
    const failure = new Error("Chromium hung.");
    browser.close = async () => {
      throw failure;
    };

    await engine.start();
    const error = await engine.stop().then(
      () => undefined,
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([failure]);
    expect(events.slice(-2)).toEqual([
      "maintenance-policy.stop",
      "printer.stop",
    ]);
  });

  test("procedures get the objects it was built from", () => {
    const { engine, browser } = setup();

    expect(engine.services.puppeteerLifecycle).toBe(browser);
    expect(engine.services.adminOrigins.allows("https://admin.local")).toBe(
      true,
    );
    expect(engine.services.adminOrigins.allows("https://evil.local")).toBe(
      false,
    );
  });
});
