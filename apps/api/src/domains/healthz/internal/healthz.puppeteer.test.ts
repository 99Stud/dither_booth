import { describe, expect, test } from "bun:test";

import { createPuppeteerClientRouteHealthz } from "./healthz.puppeteer";

const CURRENT_URL = "https://web.local/receipt-viewer?template=tartines";

describe("createPuppeteerClientRouteHealthz", () => {
  test("passes when the ready status is the only observed marker", () => {
    expect(
      createPuppeteerClientRouteHealthz({
        currentUrl: CURRENT_URL,
        statuses: ["ready"],
      }),
    ).toEqual({
      ok: true,
      details: {
        currentPath: "/receipt-viewer",
        currentUrl: CURRENT_URL,
        status: "ready",
        statuses: ["ready"],
      },
    });
  });

  test("fails when a not-found status is present", () => {
    expect(
      createPuppeteerClientRouteHealthz({
        currentUrl: CURRENT_URL,
        statuses: ["ready", "not-found"],
      }),
    ).toEqual({
      ok: false,
      message: "Puppeteer page rendered the not found route.",
      error: {
        message: "Puppeteer page rendered the not found route.",
        context: {
          currentPath: "/receipt-viewer",
          currentUrl: CURRENT_URL,
          status: "not-found",
          statuses: ["ready", "not-found"],
        },
      },
      details: {
        currentPath: "/receipt-viewer",
        currentUrl: CURRENT_URL,
        status: "not-found",
        statuses: ["ready", "not-found"],
      },
    });
  });

  test("fails when an error status is present", () => {
    expect(
      createPuppeteerClientRouteHealthz({
        currentUrl: CURRENT_URL,
        statuses: ["error"],
      }),
    ).toEqual({
      ok: false,
      message: "Puppeteer page rendered an error route.",
      error: {
        message: "Puppeteer page rendered an error route.",
        context: {
          currentPath: "/receipt-viewer",
          currentUrl: CURRENT_URL,
          status: "error",
          statuses: ["error"],
        },
      },
      details: {
        currentPath: "/receipt-viewer",
        currentUrl: CURRENT_URL,
        status: "error",
        statuses: ["error"],
      },
    });
  });

  test("fails when the route status marker is missing", () => {
    expect(
      createPuppeteerClientRouteHealthz({
        currentUrl: CURRENT_URL,
        statuses: [],
      }),
    ).toEqual({
      ok: false,
      message: "Puppeteer page route status marker was not found.",
      error: {
        message: "Puppeteer page route status marker was not found.",
        context: {
          currentPath: "/receipt-viewer",
          currentUrl: CURRENT_URL,
          statuses: [],
        },
      },
      details: {
        currentPath: "/receipt-viewer",
        currentUrl: CURRENT_URL,
        statuses: [],
      },
    });
  });
});
