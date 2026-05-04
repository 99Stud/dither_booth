import type { TRPCContext } from "#lib/trpc/trpc.types";
import type { Page } from "puppeteer";

import { apiRouter } from "#internal/router";
import { API_BROWSER_LOG_SOURCE } from "#lib/browser/browser.constants";
import { API_PRINTER_LOG_SOURCE } from "#lib/printer/printer.constants";
import {
  API_SERVER_BIND_HOST,
  API_SERVER_LOG_SOURCE,
  API_SERVER_ORIGIN,
} from "#lib/server/server.constants";
import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { getPort } from "@dither-booth/ports";
import USB from "@node-escpos/usb-adapter";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import http from "node:http";
import puppeteer from "puppeteer";

import { db } from "./db";

export async function runApiServer(options: {
  mode: "development" | "production";
}) {
  if (options.mode === "development" && Bun.env.NODE_ENV === "production") {
    throw new Error(
      "runApiServer: development mode must not run with NODE_ENV=production",
    );
  }

  let printerDevice: USB | undefined;
  let page: Page | undefined;

  try {
    printerDevice = new USB();
  } catch (error) {
    logKioskEvent("error", API_PRINTER_LOG_SOURCE, "printer-init-failed", {
      error: getKioskErrorDiagnostics(error, "Printer initialization failed."),
    });
  }

  try {
    const browser = await puppeteer.launch();
    page = await browser.newPage();
    await page.setViewport({
      deviceScaleFactor: 2,
      width: 1440,
      height: 900,
    });
  } catch (error) {
    logKioskEvent("error", API_BROWSER_LOG_SOURCE, "browser-init-failed", {
      error: getKioskErrorDiagnostics(error, "Browser initialization failed."),
    });
  }

  const createContext = (): TRPCContext => ({
    printerDevice,
    page,
    db,
  });

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
        boundAddress: `${address.address}:${address.port}`,
        url: API_SERVER_ORIGIN,
      },
    });
  }

  return server;
}
