import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import {
  getAdminOrigin,
  getSetupServerTokenPath,
  getPort,
  getWebTlsHostnames,
} from "@dither-booth/ports";
import { DARKROOM_TOKEN_HEADER } from "@dither-booth/shared/darkroom";
import {
  ENGINE_HEALTHZ_SERVICE,
  createHealthzPayload,
} from "@dither-booth/shared/healthz";
import { SETUP_SERVER_TOKEN_HEADER } from "@dither-booth/shared/server/network";
import { assertNonProductionNodeEnvForDevelopmentMode } from "@dither-booth/shared/server/runtime";
import {
  createHTTPHandler,
  type CreateHTTPContextOptions,
} from "@trpc/server/adapters/standalone";
import http from "node:http";
import { resolve } from "node:path";

import type { TRPCContext } from "#lib/trpc/trpc.types";

import { createDarkroomAccess } from "#domains/darkroom/darkroom.service";
import {
  BOOT_ID_PATH,
  DEVICE_SETUP_LOG_SOURCE,
  SETUP_TICKET_KEY_PATH,
  createSetupTicketAutoPrint,
  getCurrentSetupTicket,
} from "#domains/device-setup/device-setup.service";
import {
  CAMERA_PREVIEW_ICE_SERVERS,
  CAMERA_PREVIEW_MAX_DURATION_MS,
  CAMERA_PREVIEW_MAX_VIEWERS,
  createCameraPreview,
  createKioskChannel,
  createKioskMaintenance,
} from "#domains/kiosk/kiosk.service";
import {
  createSetupServerAccess,
  defaultLater,
  runNmcli,
  type NetworkDeps,
} from "#domains/network/network.service";
import {
  createBoothPrinter,
  createPrinterMaintenancePolicy,
  createUsbPrinterTransport,
} from "#domains/printer/printer.service";
import { engineRouter } from "#internal/router";
import { ENGINE_REPO_ROOT } from "#lib/constants";
import { ENGINE_PRINTER_LOG_SOURCE } from "#lib/printer/printer.constants";
import { getRuntimeProcessManager } from "#lib/process-manager/process-manager.utils";
import { createPuppeteerReceiptViewerLifecycle } from "#lib/puppeteer/puppeteer-lifecycle.utils";
import { isReceiptPrintDryRun } from "#lib/runtime-flags/runtime-flags";
import {
  ENGINE_SERVER_BIND_HOST,
  ENGINE_SERVER_LOG_SOURCE,
  ENGINE_SERVER_ORIGIN,
} from "#lib/server/server.constants";

import { db } from "./db";
import { applySqliteMigrations } from "./db/internal/db.migrate";
import { ensureDefaultPrintConfiguration } from "./db/internal/db.seed";

type EngineServerLifecycle = {
  close: () => Promise<void>;
  server: http.Server;
};

async function closeHttpServer(server: http.Server) {
  await new Promise<void>((resolvePromise, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolvePromise();
    });
  });
}

export async function runEngineServer(options: {
  mode: "development" | "production";
}): Promise<EngineServerLifecycle> {
  assertNonProductionNodeEnvForDevelopmentMode({
    mode: options.mode,
    serverName: "runEngineServer",
  });

  applySqliteMigrations();
  await ensureDefaultPrintConfiguration();

  const receiptPrintDryRun = isReceiptPrintDryRun();

  if (receiptPrintDryRun) {
    logKioskEvent(
      "info",
      ENGINE_PRINTER_LOG_SOURCE,
      "receipt-print-dry-run-enabled",
      {
        details: {
          message:
            "RECEIPT_PRINT_DRY_RUN is enabled; the printer is not opened or watched.",
        },
      },
    );
  }

  // Watched from the start, reconnecting on its own: a printer plugged in
  // after boot is picked up without a restart.
  const printer = createBoothPrinter({
    transport: receiptPrintDryRun ? undefined : createUsbPrinterTransport(),
  });

  const puppeteerLifecycle = createPuppeteerReceiptViewerLifecycle();

  const adminOrigin = await getAdminOrigin({ repoRoot: ENGINE_REPO_ROOT });
  const allowedHostnames = await getWebTlsHostnames({
    repoRoot: ENGINE_REPO_ROOT,
  });
  const processManager = getRuntimeProcessManager();
  const kioskChannel = createKioskChannel();
  // Off in development, so a laptop without the printer keeps the kiosk open.
  const kioskMaintenance = createKioskMaintenance({
    automaticByDefault: options.mode === "production",
    db,
    kioskChannel,
  });
  const printerMaintenance = createPrinterMaintenancePolicy({
    maintenance: kioskMaintenance,
    printer,
  });
  const cameraPreview = createCameraPreview({
    kioskChannel,
    iceServers: CAMERA_PREVIEW_ICE_SERVERS,
    maxViewers: CAMERA_PREVIEW_MAX_VIEWERS,
    maxDurationMs: CAMERA_PREVIEW_MAX_DURATION_MS,
  });
  const darkroomAccess = createDarkroomAccess({ db });
  const setupServerAccess = await createSetupServerAccess(
    getSetupServerTokenPath({ repoRoot: ENGINE_REPO_ROOT }),
  );
  const logDeviceSetup = (
    level: "info" | "warn" | "error",
    event: string,
    details?: Record<string, unknown>,
  ) => {
    logKioskEvent(level, DEVICE_SETUP_LOG_SOURCE, event, { details });
  };
  const network: NetworkDeps = {
    later: defaultLater,
    nmcli: runNmcli,
    onJoinFailed: async (failure) => {
      logDeviceSetup("warn", "wifi-join-failed", failure);
      const ticket = await getCurrentSetupTicket(network, {
        notice: `Couldn't join ${failure.ssid}: ${failure.reason}`,
        repoRoot: ENGINE_REPO_ROOT,
      });
      await printer.print(ticket.body, { content: "escpos" }).catch(() => {
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

  const createContext = ({ req }: CreateHTTPContextOptions): TRPCContext => {
    const { page, state: puppeteerState } = puppeteerLifecycle.getCurrent();
    const darkroomToken = req.headers[DARKROOM_TOKEN_HEADER];
    const setupServerToken = req.headers[SETUP_SERVER_TOKEN_HEADER];

    return {
      adminOrigin,
      allowedHostnames,
      printer,
      page,
      db,
      darkroomAccess,
      darkroomToken:
        typeof darkroomToken === "string" ? darkroomToken : undefined,
      kioskChannel,
      kioskMaintenance,
      cameraPreview,
      mode: options.mode,
      network,
      processManager,
      puppeteerLifecycle,
      puppeteerState,
      requestOrigin: req.headers.origin,
      setupServerAccess,
      setupServerToken:
        typeof setupServerToken === "string" ? setupServerToken : undefined,
    };
  };

  const trpcHandler = createHTTPHandler({
    router: engineRouter,
    createContext,
    onError({ error, path, req, type }) {
      logKioskEvent("error", ENGINE_SERVER_LOG_SOURCE, "trpc-request-failed", {
        details: {
          code: error.code,
          method: req.method,
          ...(path ? { path } : {}),
          type,
          url: req.url,
        },
        error: getKioskErrorDiagnostics(
          error,
          error.message || "Engine request failed.",
        ),
      });
    },
  });

  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, OPTIONS, PUT, PATCH, DELETE",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      req.headers["access-control-request-headers"] ?? "Content-Type",
    );

    const url = new URL(req.url ?? "/", ENGINE_SERVER_ORIGIN);

    if (url.pathname === "/healthz") {
      if (req.method !== "GET") {
        res.writeHead(405, {
          Allow: "GET",
        });
        res.end();
        return;
      }

      res.writeHead(200, {
        "Content-Type": "application/json",
      });
      res.end(
        JSON.stringify(
          createHealthzPayload({
            mode: options.mode,
            service: ENGINE_HEALTHZ_SERVICE,
          }),
        ),
      );
      return;
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    trpcHandler(req, res);
  });

  // Bind before Puppeteer init so the shutter and admin proxies are not refused while Chrome starts.
  server.listen(getPort("ENGINE_PORT"), ENGINE_SERVER_BIND_HOST);

  const address = server.address();

  if (address && typeof address !== "string") {
    logKioskEvent("info", ENGINE_SERVER_LOG_SOURCE, "server-started", {
      details: {
        environment: process.env.NODE_ENV,
        processManager,
        boundAddress: `${address.address}:${address.port}`,
        url: ENGINE_SERVER_ORIGIN,
      },
    });
  }

  await puppeteerLifecycle.initialize();
  printer.start();
  if (!receiptPrintDryRun) printerMaintenance.start();
  // A booth plugged in at a venue prints the way in; a laptop doesn't.
  if (options.mode === "production" && !receiptPrintDryRun) {
    setupTicketAutoPrint.start();
  }

  let closePromise: Promise<void> | undefined;

  const close = () => {
    closePromise ??= (async () => {
      logKioskEvent(
        "info",
        ENGINE_SERVER_LOG_SOURCE,
        "server-shutdown-started",
      );

      const errors: unknown[] = [];
      const closeResource = async (
        resource: string,
        closeResourceFn: () => Promise<void> | void,
      ) => {
        try {
          await closeResourceFn();
        } catch (error) {
          errors.push(error);
          logKioskEvent(
            "error",
            ENGINE_SERVER_LOG_SOURCE,
            "server-shutdown-failed",
            {
              details: {
                resource,
              },
              error: getKioskErrorDiagnostics(error, "Engine shutdown failed."),
            },
          );
        }
      };

      await closeResource("http-server", () => closeHttpServer(server));
      await closeResource("browser", () => puppeteerLifecycle.close());
      await closeResource("printer", async () => {
        setupTicketAutoPrint.stop();
        printerMaintenance.stop();
        await printer.stop();
      });

      if (errors.length > 0) {
        throw new AggregateError(errors, "engine server shutdown failed.");
      }

      logKioskEvent(
        "info",
        ENGINE_SERVER_LOG_SOURCE,
        "server-shutdown-completed",
      );
    })();

    return closePromise;
  };

  return {
    close,
    server,
  };
}
