import { describe, expect, test } from "bun:test";

import { engineRouter } from "#internal/router";
import { createAdminOrigins } from "#internal/trpc";
import { createInitialPuppeteerState } from "#lib/puppeteer/puppeteer.utils";
import {
  TEST_ADMIN_ORIGIN,
  createTestContext,
} from "#lib/trpc/trpc.test-utils";

const ADMIN_LAN_ORIGIN = "https://192.168.1.10:3002";

function createTestCaller(
  origin?: string,
  adminOrigin = TEST_ADMIN_ORIGIN,
  allowedHostnames: readonly string[] = [],
) {
  const state = createInitialPuppeteerState();
  const restartResult = {
    ok: true,
    state,
  };
  let restartCalls = 0;
  const context = createTestContext({
    adminOrigins: createAdminOrigins({ adminOrigin, allowedHostnames }),
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
    request: { origin },
  });

  return {
    caller: engineRouter.createCaller(context),
    getRestartCalls: () => restartCalls,
    restartResult,
  };
}

describe("restartPuppeteerReceiptViewer", () => {
  test("allows requests from the admin origin", async () => {
    const { caller, getRestartCalls, restartResult } =
      createTestCaller(TEST_ADMIN_ORIGIN);

    await expect(caller.ops.restartPuppeteerReceiptViewer()).resolves.toBe(
      restartResult,
    );
    expect(getRestartCalls()).toBe(1);
  });

  test("allows localhost on the same admin port as the LAN origin", async () => {
    const { caller, getRestartCalls, restartResult } = createTestCaller(
      "https://localhost:3002",
      ADMIN_LAN_ORIGIN,
    );

    await expect(caller.ops.restartPuppeteerReceiptViewer()).resolves.toBe(
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

    await expect(caller.ops.restartPuppeteerReceiptViewer()).resolves.toBe(
      restartResult,
    );
    expect(getRestartCalls()).toBe(1);
  });

  test("rejects requests from a different origin", async () => {
    const { caller, getRestartCalls } = createTestCaller("https://evil.local");

    await expect(
      caller.ops.restartPuppeteerReceiptViewer(),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Request origin not allowed.",
    });
    expect(getRestartCalls()).toBe(0);
  });

  test("rejects requests with no origin", async () => {
    const { caller, getRestartCalls } = createTestCaller();

    await expect(
      caller.ops.restartPuppeteerReceiptViewer(),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Request origin not allowed.",
    });
    expect(getRestartCalls()).toBe(0);
  });
});
