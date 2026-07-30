import { describe, expect, test } from "bun:test";

import type { TRPCContext } from "#lib/trpc/trpc.types";

import { apiRouter } from "#internal/router";
import { createInitialPuppeteerState } from "#lib/puppeteer/puppeteer.utils";

const ADMIN_ORIGIN = "https://admin.local";
const ADMIN_LAN_ORIGIN = "https://192.168.1.10:3002";

function createTestCaller(
  requestOrigin?: string,
  adminOrigin = ADMIN_ORIGIN,
  allowedHostnames: readonly string[] = [],
) {
  const state = createInitialPuppeteerState();
  const restartResult = {
    ok: true,
    state,
  };
  let restartCalls = 0;
  const context = {
    adminOrigin,
    allowedHostnames,
    db: {} as TRPCContext["db"],
    mode: "production",
    page: undefined,
    printerUSBAdapter: undefined,
    processManager: "unknown",
    puppeteerLifecycle: {
      close: async () => {},
      getCurrent: () => ({ state }),
      initialize: async () => ({ state }),
      restart: async () => {
        restartCalls += 1;

        return restartResult;
      },
      whenReady: async () => ({ state }),
    },
    puppeteerState: state,
    requestOrigin,
  } satisfies TRPCContext;

  return {
    caller: apiRouter.createCaller(context),
    getRestartCalls: () => restartCalls,
    restartResult,
  };
}

describe("restartPuppeteerReceiptViewer", () => {
  test("allows requests from the admin origin", async () => {
    const { caller, getRestartCalls, restartResult } =
      createTestCaller(ADMIN_ORIGIN);

    await expect(caller.restartPuppeteerReceiptViewer()).resolves.toBe(
      restartResult,
    );
    expect(getRestartCalls()).toBe(1);
  });

  test("allows localhost on the same admin port as the LAN origin", async () => {
    const { caller, getRestartCalls, restartResult } = createTestCaller(
      "https://localhost:3002",
      ADMIN_LAN_ORIGIN,
    );

    await expect(caller.restartPuppeteerReceiptViewer()).resolves.toBe(
      restartResult,
    );
    expect(getRestartCalls()).toBe(1);
  });

  test("allows machine hostname from the TLS manifest", async () => {
    const { caller, getRestartCalls, restartResult } = createTestCaller(
      "https://99framboises.local:3002",
      ADMIN_LAN_ORIGIN,
      ["99framboises", "99framboises.local"],
    );

    await expect(caller.restartPuppeteerReceiptViewer()).resolves.toBe(
      restartResult,
    );
    expect(getRestartCalls()).toBe(1);
  });

  test("rejects requests from a different origin", async () => {
    const { caller, getRestartCalls } = createTestCaller("https://evil.local");

    await expect(caller.restartPuppeteerReceiptViewer()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Request origin not allowed.",
    });
    expect(getRestartCalls()).toBe(0);
  });

  test("rejects requests with no origin", async () => {
    const { caller, getRestartCalls } = createTestCaller();

    await expect(caller.restartPuppeteerReceiptViewer()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Request origin not allowed.",
    });
    expect(getRestartCalls()).toBe(0);
  });
});
