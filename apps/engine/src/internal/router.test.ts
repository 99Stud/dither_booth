import { describe, expect, test } from "bun:test";

import type { KioskChannel } from "#domains/kiosk/kiosk.service";
import type { TRPCContext } from "#lib/trpc/trpc.types";

import { createDarkroomAccessStub } from "#domains/darkroom/internal/darkroom.test-utils";
import { createInitialPuppeteerState } from "#lib/puppeteer/puppeteer.utils";

import { engineRouter } from "./router";

const ADMIN_ORIGIN = "https://admin.local";
const KIOSK_ORIGIN = "https://192.168.1.10:3000";
const DARKROOM_TOKEN = "darkroom-token";

const SETUP_SERVER_TOKEN = "setup-server-token";

const GROUPS = {
  captive: ["getCaptiveStatus", "joinFromCaptive"],
  booth: [
    "getFontAsset",
    "getKit",
    "getLotteryStatus",
    "lockDarkroom",
    "onKioskCommand",
    "prepareReceipt",
    "printPreparedReceipt",
    "reportKioskStatus",
    "sendKioskCameraSignal",
    "unlockDarkroom",
  ],
  config: [
    "createEvent",
    "createPrize",
    "deleteFontAsset",
    "deletePrize",
    "dither",
    "forgetWifiNetwork",
    "generateReceipt",
    "getCurrentEvent",
    "getDarkroomPinStatus",
    "getDeviceSetup",
    "getNetworkStatus",
    "getPrintConfiguration",
    "installLibraryFont",
    "listFontAssets",
    "listDraws",
    "printReceipt",
    "printSampleLotteryTicket",
    "printSetupTicket",
    "replaceEvent",
    "restockPrize",
    "saveWifiNetwork",
    "searchFontLibrary",
    "setBoothWifi",
    "setDarkroomPin",
    "updateEvent",
    "updateKitSettings",
    "updateLotterySettings",
    "updatePrintConfiguration",
    "updatePrize",
    "updateTicketItems",
    "uploadFont",
  ],
  ops: [
    "getHealthz",
    "reloadKiosk",
    "restartPuppeteerReceiptViewer",
    "sendCameraSignal",
    "setAutomaticMaintenance",
    "setKioskMaintenance",
    "showKioskScreen",
    "watchCamera",
    "watchPrinter",
  ],
} as const;

/**
 * What a Darkroom token opens: print tuning, sample tickets, read-only
 * status, and the booth's Wi-Fi and setup ticket (staff at the booth pick
 * the venue's network from the iPad). Everything else in `config.*` and `ops.*` — setting the PIN
 * included — stays admin-only.
 */
const DARKROOM_PATHS = [
  "config.dither",
  "config.forgetWifiNetwork",
  "config.generateReceipt",
  "config.getCurrentEvent",
  "config.getDeviceSetup",
  "config.getNetworkStatus",
  "config.getPrintConfiguration",
  "config.printReceipt",
  "config.printSampleLotteryTicket",
  "config.printSetupTicket",
  "config.saveWifiNetwork",
  "config.setBoothWifi",
  "config.updatePrintConfiguration",
  "ops.getHealthz",
];

const procedurePaths = Object.keys(engineRouter._def.procedures);

function groupPaths(group: keyof typeof GROUPS) {
  return procedurePaths.filter((path) => path.startsWith(`${group}.`));
}

function createCaller(
  requestOrigin?: string,
  darkroomToken?: string,
  setupServerToken?: string,
) {
  const state = createInitialPuppeteerState();
  const unreachable = () => {
    throw new Error("A guarded procedure ran past its origin check.");
  };

  // Every dependency throws: a rejected origin must stop the call before any
  // of them is touched.
  const context = {
    adminOrigin: ADMIN_ORIGIN,
    allowedHostnames: [],
    darkroomAccess: createDarkroomAccessStub(DARKROOM_TOKEN),
    darkroomToken,
    db: new Proxy({}, { get: unreachable }) as TRPCContext["db"],
    kioskChannel: new Proxy({}, { get: unreachable }) as KioskChannel,
    cameraPreview: new Proxy(
      {},
      { get: unreachable },
    ) as TRPCContext["cameraPreview"],
    kioskMaintenance: new Proxy(
      {},
      { get: unreachable },
    ) as TRPCContext["kioskMaintenance"],
    mode: "production",
    network: {
      later: unreachable,
      nmcli: unreachable,
      onJoinFailed: unreachable,
    },
    printer: new Proxy({}, { get: unreachable }) as TRPCContext["printer"],
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
    setupServerAccess: {
      verify: (token) => token === SETUP_SERVER_TOKEN,
    },
    setupServerToken,
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

  describe("Darkroom token", () => {
    const guardedPaths = [...groupPaths("config"), ...groupPaths("ops")];

    for (const path of guardedPaths) {
      const opens = DARKROOM_PATHS.includes(path);

      test(`${path} ${opens ? "accepts" : "still rejects"} a Darkroom token`, async () => {
        const call = getProcedure(
          createCaller(KIOSK_ORIGIN, DARKROOM_TOKEN),
          path,
        );
        const error = await call(undefined).then(
          () => undefined,
          (cause: unknown) => cause,
        );

        if (opens) {
          // Past the guard, the call fails on its (throwing) dependencies or
          // its input, or reads the booth's address, never fails on access.
          expect((error as { code?: string } | undefined)?.code).not.toBe(
            "FORBIDDEN",
          );
        } else {
          expect(error).toMatchObject({ code: "FORBIDDEN" });
        }
      });
    }

    test("a wrong token is refused like no token", async () => {
      const call = getProcedure(
        createCaller(KIOSK_ORIGIN, "stolen-or-expired"),
        "config.updatePrintConfiguration",
      );

      await expect(call(undefined)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    test("every Darkroom path exists", () => {
      for (const path of DARKROOM_PATHS) {
        expect(procedurePaths).toContain(path);
      }
    });
  });

  describe("captive.*", () => {
    for (const path of groupPaths("captive")) {
      test(`${path} refuses the admin and the Darkroom`, async () => {
        for (const caller of [
          createCaller(ADMIN_ORIGIN),
          createCaller(KIOSK_ORIGIN, DARKROOM_TOKEN),
          createCaller(KIOSK_ORIGIN, undefined, "guessed"),
        ]) {
          await expect(
            getProcedure(caller, path)(undefined),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
        }
      });

      test(`${path} opens to the setup server's token`, async () => {
        const call = getProcedure(
          createCaller(undefined, undefined, SETUP_SERVER_TOKEN),
          path,
        );
        const error = await call(undefined).then(
          () => undefined,
          (cause: unknown) => cause,
        );

        expect((error as { code?: string } | undefined)?.code).not.toBe(
          "FORBIDDEN",
        );
      });
    }
  });

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
