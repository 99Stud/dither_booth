import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import {
  getAdminOrigin,
  getPort,
  getWebTlsHostnames,
} from "@dither-booth/ports";
import {
  ENGINE_HEALTHZ_SERVICE,
  createHealthzPayload,
} from "@dither-booth/shared/healthz";
import { assertNonProductionNodeEnvForDevelopmentMode } from "@dither-booth/shared/server/runtime";
import USB from "@node-escpos/usb-adapter";
import {
  createHTTPHandler,
  type CreateHTTPContextOptions,
} from "@trpc/server/adapters/standalone";
import http from "node:http";

import type { TRPCContext } from "#lib/trpc/trpc.types";

import { createKioskChannel } from "#domains/kiosk/kiosk.service";
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

type CloseableResource = {
  close: () => Promise<void> | void;
};

function isCloseableResource(value: unknown): value is CloseableResource {
  return (
    typeof value === "object" &&
    value !== null &&
    "close" in value &&
    typeof value.close === "function"
  );
}

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

async function closePrinterUSBAdapter(printerUSBAdapter: USB | undefined) {
  if (isCloseableResource(printerUSBAdapter)) {
    printerUSBAdapter.close();
  }
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
  let printerUSBAdapter: USB | undefined;

  if (receiptPrintDryRun) {
    logKioskEvent(
      "info",
      ENGINE_PRINTER_LOG_SOURCE,
      "receipt-print-dry-run-enabled",
      {
        details: {
          message:
            "RECEIPT_PRINT_DRY_RUN is enabled; skipping USB printer initialization.",
        },
      },
    );
  } else {
    try {
      printerUSBAdapter = new USB();
    } catch (error) {
      logKioskEvent("error", ENGINE_PRINTER_LOG_SOURCE, "printer-init-failed", {
        error: getKioskErrorDiagnostics(
          error,
          "Printer initialization failed.",
        ),
      });
    }
  }

  const puppeteerLifecycle = createPuppeteerReceiptViewerLifecycle();

  const adminOrigin = await getAdminOrigin({ repoRoot: ENGINE_REPO_ROOT });
  const allowedHostnames = await getWebTlsHostnames({
    repoRoot: ENGINE_REPO_ROOT,
  });
  const processManager = getRuntimeProcessManager();
  const kioskChannel = createKioskChannel();

  const createContext = ({ req }: CreateHTTPContextOptions): TRPCContext => {
    const { page, state: puppeteerState } = puppeteerLifecycle.getCurrent();

    return {
      adminOrigin,
      allowedHostnames,
      printerUSBAdapter,
      page,
      db,
      kioskChannel,
      mode: options.mode,
      processManager,
      puppeteerLifecycle,
      puppeteerState,
      requestOrigin: req.headers.origin,
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
      await closeResource("printer", () =>
        closePrinterUSBAdapter(printerUSBAdapter),
      );

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
