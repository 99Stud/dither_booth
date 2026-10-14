import { describe, expect, test } from "bun:test";

import type { TRPCContext } from "#lib/trpc/trpc.types";

import { createInitialPuppeteerState } from "#lib/puppeteer/puppeteer.utils";

import { engineRouter } from "./router";

const ADMIN_ORIGIN = "https://admin.local";

const GROUPS = {
  booth: ["getLotteryStatus", "prepareReceipt", "printPreparedReceipt"],
  config: [
    "createEvent",
    "createPrize",
    "deletePrize",
    "dither",
    "generateReceipt",
    "getCurrentEvent",
    "getPrintConfiguration",
    "listDraws",
    "printReceipt",
    "printSampleLotteryTicket",
    "replaceEvent",
    "restockPrize",
    "updateEvent",
    "updateLotterySettings",
    "updatePrintConfiguration",
    "updatePrize",
    "updateTicketItems",
  ],
  ops: ["getHealthz", "restartPuppeteerReceiptViewer"],
} as const;

const procedurePaths = Object.keys(engineRouter._def.procedures);

function groupPaths(group: keyof typeof GROUPS) {
  return procedurePaths.filter((path) => path.startsWith(`${group}.`));
}

function createCaller(requestOrigin?: string) {
  const state = createInitialPuppeteerState();
  const unreachable = () => {
    throw new Error("A guarded procedure ran past its origin check.");
  };

  // Every dependency throws: a rejected origin must stop the call before any
  // of them is touched.
  const context = {
    adminOrigin: ADMIN_ORIGIN,
    allowedHostnames: [],
    db: new Proxy({}, { get: unreachable }) as TRPCContext["db"],
    mode: "production",
    processManager: "unknown",
    puppeteerLifecycle: {
      close: unreachable,
      getCurrent: unreachable,
      initialize: unreachable,
      restart: unreachable,
      whenReady: unreachable,
    },
    puppeteerState: state,
    requestOrigin,
  } satisfies TRPCContext;

  return engineRouter.createCaller(context);
}

type AnyProcedureCall = (input?: unknown) => Promise<unknown>;

function getProcedure(
  caller: ReturnType<typeof createCaller>,
  path: string,
): AnyProcedureCall {
  const [group, name] = path.split(".") as [string, string];
  const groupCaller = (caller as unknown as Record<string, unknown>)[
    group
  ] as Record<string, AnyProcedureCall>;

  return groupCaller[name]!;
}

describe("engineRouter", () => {
  test("every procedure sits in exactly one known group", () => {
    expect(procedurePaths.toSorted()).toEqual(
      Object.entries(GROUPS)
        .flatMap(([group, names]) => names.map((name) => `${group}.${name}`))
        .toSorted(),
    );
  });

  for (const group of ["config", "ops"] as const) {
    describe(`${group}.*`, () => {
      for (const path of groupPaths(group)) {
        test(`${path} rejects a non-admin origin`, async () => {
          const call = getProcedure(
            createCaller("https://192.168.1.10:3000"),
            path,
          );

          await expect(call(undefined)).rejects.toMatchObject({
            code: "FORBIDDEN",
          });
        });

        test(`${path} rejects a request with no origin`, async () => {
          const call = getProcedure(createCaller(undefined), path);

          await expect(call(undefined)).rejects.toMatchObject({
            code: "FORBIDDEN",
          });
        });
      }
    });
  }

  test("booth.* is reachable from the kiosk origin", async () => {
    const call = getProcedure(
      createCaller("https://192.168.1.10:3000"),
      "booth.getLotteryStatus",
    );

    // Past the access check, the procedure reaches the (throwing) database.
    await expect(call(undefined)).rejects.toThrow(
      "A guarded procedure ran past its origin check.",
    );
  });
});
