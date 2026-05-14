import type { TRPCContext } from "#lib/trpc/trpc.types";

import { API_HEALTHZ_SERVICE } from "#domains/healthz/internal/healthz.constants";
import { createHealthzPayload } from "#domains/healthz/internal/healthz.utils";
import { apiRouter } from "#internal/router";
import { API_REPO_ROOT } from "#lib/constants";
import { API_PRINTER_LOG_SOURCE } from "#lib/printer/printer.constants";
import { getRuntimeProcessManager } from "#lib/process-manager/process-manager.utils";
import { createPuppeteerReceiptViewerLifecycle } from "#lib/puppeteer/puppeteer-lifecycle.utils";
import {
  API_SERVER_BIND_HOST,
  API_SERVER_LOG_SOURCE,
  API_SERVER_ORIGIN,
} from "#lib/server/server.constants";
import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { getAdminOrigin, getPort } from "@dither-booth/ports";
import USB from "@node-escpos/usb-adapter";
import {
  createHTTPHandler,
  type CreateHTTPContextOptions,
} from "@trpc/server/adapters/standalone";
import http from "node:http";

import { db } from "./db";

type ApiServerLifecycle = {
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

async function closePrinterDevice(printerDevice: USB | undefined) {
  if (isCloseableResource(printerDevice)) {
    printerDevice.close();
  }
}

export async function runApiServer(options: {
  mode: "development" | "production";
}): Promise<ApiServerLifecycle> {
  if (options.mode === "development" && Bun.env.NODE_ENV === "production") {
    throw new Error(
      "runApiServer: development mode must not run with NODE_ENV=production",
    );
  }

  let printerDevice: USB | undefined;
  try {
    printerDevice = new USB();
  } catch (error) {
    logKioskEvent("error", API_PRINTER_LOG_SOURCE, "printer-init-failed", {
      error: getKioskErrorDiagnostics(error, "Printer initialization failed."),
    });
  }

  const puppeteerLifecycle = createPuppeteerReceiptViewerLifecycle({
    repoRoot: API_REPO_ROOT,
  });
  await puppeteerLifecycle.initialize();

  const adminOrigin = await getAdminOrigin({ repoRoot: API_REPO_ROOT });
  const processManager = getRuntimeProcessManager();

  const createContext = ({ req }: CreateHTTPContextOptions): TRPCContext => {
    const { page, state: puppeteerState } = puppeteerLifecycle.getCurrent();

    return {
      adminOrigin,
      printerDevice,
      page,
      db,
      mode: options.mode,
      processManager,
      puppeteerLifecycle,
      puppeteerState,
      requestOrigin: req.headers.origin,
    };
  };

  const trpcHandler = createHTTPHandler({
    router: apiRouter,
    createContext,
    onError({ error, path, req, type }) {
      logKioskEvent("error", API_SERVER_LOG_SOURCE, "trpc-request-failed", {
        details: {
          code: error.code,
          method: req.method,
          ...(path ? { path } : {}),
          type,
          url: req.url,
        },
        error: getKioskErrorDiagnostics(
          error,
          error.message || "API request failed.",
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

    const url = new URL(req.url ?? "/", API_SERVER_ORIGIN);

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
            service: API_HEALTHZ_SERVICE,
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

  server.listen(getPort("API_PORT"), API_SERVER_BIND_HOST);

  const address = server.address();

  if (address && typeof address !== "string") {
    logKioskEvent("info", API_SERVER_LOG_SOURCE, "server-started", {
      details: {
        environment: process.env.NODE_ENV,
        processManager,
        boundAddress: `${address.address}:${address.port}`,
        url: API_SERVER_ORIGIN,
      },
    });
  }

  let closePromise: Promise<void> | undefined;

  const close = () => {
    closePromise ??= (async () => {
      logKioskEvent("info", API_SERVER_LOG_SOURCE, "server-shutdown-started");

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
            API_SERVER_LOG_SOURCE,
            "server-shutdown-failed",
            {
              details: {
                resource,
              },
              error: getKioskErrorDiagnostics(error, "API shutdown failed."),
            },
          );
        }
      };

      await closeResource("http-server", () => closeHttpServer(server));
      await closeResource("browser", () => puppeteerLifecycle.close());
      await closeResource("printer", () => closePrinterDevice(printerDevice));

      if (errors.length > 0) {
        throw new AggregateError(errors, "API server shutdown failed.");
      }

      logKioskEvent("info", API_SERVER_LOG_SOURCE, "server-shutdown-completed");
    })();

    return closePromise;
  };

  return {
    close,
    server,
  };
}
