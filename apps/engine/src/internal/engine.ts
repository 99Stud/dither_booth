import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { resolve } from "node:path";

import type { DB } from "#db/internal/db.types";
import type { SetupServerAccess } from "#domains/captive/captive.service";
import type { HubEndpoint } from "#domains/hub/hub.service";
import type { BoothPrinter } from "#domains/printer/printer.service";
import type { RuntimeProcessManager } from "#lib/process-manager/process-manager.types";
import type { PuppeteerReceiptViewerLifecycle } from "#lib/puppeteer/puppeteer.types";
import type { EngineServices } from "#lib/trpc/trpc.types";

import { createDarkroomAccess } from "#domains/darkroom/darkroom.service";
import {
  BOOT_ID_PATH,
  DEVICE_SETUP_LOG_SOURCE,
  SETUP_TICKET_KEY_PATH,
  createSetupTicketAutoPrint,
  getCurrentSetupTicket,
} from "#domains/device-setup/device-setup.service";
import { createHubReporter, HUB_LOG_SOURCE } from "#domains/hub/hub.service";
import {
  CAMERA_PREVIEW_ICE_SERVERS,
  CAMERA_PREVIEW_MAX_DURATION_MS,
  CAMERA_PREVIEW_MAX_VIEWERS,
  createCameraPreview,
  createKioskChannel,
  createKioskMaintenance,
} from "#domains/kiosk/kiosk.service";
import {
  defaultLater,
  type NetworkDeps,
  type Nmcli,
} from "#domains/network/network.service";
import { createPrinterMaintenancePolicy } from "#domains/printer/printer.service";
import {
  createPuppeteerTicketRenderer,
  createTickets,
} from "#domains/receipt/receipt.service";
import { createAdminOrigins } from "#internal/trpc";
import { ENGINE_REPO_ROOT } from "#lib/constants";
import { ENGINE_SERVER_LOG_SOURCE } from "#lib/server/server.constants";

/** What the engine is built from: the adapters at the edge of the process. */
export type EngineDeps = {
  db: DB;
  mode: "development" | "production";
  /** The receipt printer, or the preview printer in dry run. */
  printer: BoothPrinter;
  /** The receipt viewer's Chromium. */
  browser: PuppeteerReceiptViewerLifecycle;
  hub: HubEndpoint;
  release: string;
  adminOrigin: string;
  allowedHostnames: readonly string[];
  setupServerAccess: SetupServerAccess;
  processManager: RuntimeProcessManager;
  nmcli: Nmcli;
};

export type Engine = {
  /** What procedures read from their context, one of each per process. */
  services: EngineServices;
  /** Opens the browser, then watches the printer and reports to the Hub. */
  start: () => Promise<void>;
  /**
   * Stops in reverse: the Hub reporter, the browser, then the printer. Every
   * step runs even when one before it fails.
   */
  stop: () => Promise<void>;
};

/**
 * The engine's long-lived objects, built once and wired to each other. It
 * holds the only record of their start and stop order.
 */
export function createEngine(deps: EngineDeps): Engine {
  const { db, mode, printer, browser } = deps;

  const kioskChannel = createKioskChannel();
  // Off in development, so a laptop without the printer keeps the kiosk open.
  const kioskMaintenance = createKioskMaintenance({
    automaticByDefault: mode === "production",
    db,
    kioskChannel,
  });
  const printerMaintenance = createPrinterMaintenancePolicy({
    maintenance: kioskMaintenance,
    printer,
  });
  // Reports to the Hub once the booth is registered; idle until then.
  const hubReporter = createHubReporter({
    db,
    hub: deps.hub,
    printer,
    maintenance: kioskMaintenance,
    release: deps.release,
    dryRun: printer.dryRun,
    log: (level, event, details) =>
      logKioskEvent(level, HUB_LOG_SOURCE, event, { details }),
  });
  const tickets = createTickets({
    db,
    maintenance: kioskMaintenance,
    printer,
    renderer: createPuppeteerTicketRenderer(browser),
  });
  const cameraPreview = createCameraPreview({
    kioskChannel,
    iceServers: CAMERA_PREVIEW_ICE_SERVERS,
    maxViewers: CAMERA_PREVIEW_MAX_VIEWERS,
    maxDurationMs: CAMERA_PREVIEW_MAX_DURATION_MS,
  });
  const darkroomAccess = createDarkroomAccess({ db });
  const logDeviceSetup = (
    level: "info" | "warn" | "error",
    event: string,
    details?: Record<string, unknown>,
  ) => {
    logKioskEvent(level, DEVICE_SETUP_LOG_SOURCE, event, { details });
  };
  const network: NetworkDeps = {
    later: defaultLater,
    nmcli: deps.nmcli,
    onJoinFailed: async (failure) => {
      logDeviceSetup("warn", "wifi-join-failed", failure);
      const ticket = await getCurrentSetupTicket(network, {
        boothWifiNext: failure.backOnBoothWifi,
        notice: `Couldn't join ${failure.ssid}: ${failure.reason}`,
        repoRoot: ENGINE_REPO_ROOT,
      });
      if (!ticket) return;
      await setupTicketAutoPrint.printNow(ticket).catch(() => {
        logDeviceSetup("warn", "wifi-join-failed-ticket-not-printed");
      });
    },
  };
  const setupTicketAutoPrint = createSetupTicketAutoPrint({
    bootIdPath: BOOT_ID_PATH,
    getTicket: () =>
      getCurrentSetupTicket(network, { repoRoot: ENGINE_REPO_ROOT }),
    keyPath: resolve(ENGINE_REPO_ROOT, SETUP_TICKET_KEY_PATH),
    log: logDeviceSetup,
    printer,
  });

  const services: EngineServices = {
    adminOrigins: createAdminOrigins(deps),
    cameraPreview,
    darkroomAccess,
    db,
    hubReporter,
    kioskChannel,
    kioskMaintenance,
    mode,
    network,
    printer,
    processManager: deps.processManager,
    puppeteerLifecycle: browser,
    setupServerAccess: deps.setupServerAccess,
    tickets,
  };

  return {
    services,
    async start() {
      await browser.initialize();
      printer.start();
      printerMaintenance.start();
      hubReporter.start();
      // A booth plugged in at a venue prints the way in; a laptop doesn't.
      if (mode === "production" && !printer.dryRun) {
        setupTicketAutoPrint.start();
      }
    },
    async stop() {
      const errors: unknown[] = [];
      const stopResource = async (
        resource: string,
        stopResourceFn: () => Promise<void> | void,
      ) => {
        try {
          await stopResourceFn();
        } catch (error) {
          errors.push(error);
          logKioskEvent(
            "error",
            ENGINE_SERVER_LOG_SOURCE,
            "server-shutdown-failed",
            {
              details: { resource },
              error: getKioskErrorDiagnostics(error, "Engine shutdown failed."),
            },
          );
        }
      };

      await stopResource("hub-reporter", () => hubReporter.stop());
      await stopResource("browser", () => browser.close());
      await stopResource("printer", async () => {
        setupTicketAutoPrint.stop();
        printerMaintenance.stop();
        await printer.stop();
      });

      if (errors.length > 0) {
        throw new AggregateError(errors, "engine stop failed.");
      }
    },
  };
}
