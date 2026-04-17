import type { ReceiptPageSlot } from "#domains/browser-automation/internal/puppeteer-automation.ts";
import type { TRPCContext } from "#lib/trpc/trpc.types.ts";
import type { Browser } from "puppeteer";

import { createReceiptPageSlot } from "#domains/browser-automation/internal/puppeteer-automation.ts";
import { apiRouter } from "#internal/router.ts";
import { API_BROWSER_LOG_SOURCE } from "#lib/browser/browser.constants.ts";
import { getPuppeteerLaunchOptions } from "#lib/browser/puppeteer-launch-options.ts";
import { API_PRINTER_LOG_SOURCE } from "#lib/printer/printer.constants.ts";
import {
  API_SERVER_BIND_HOST,
  API_SERVER_LOG_SOURCE,
  API_SERVER_ORIGIN,
} from "#lib/server/server.constants.ts";
import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { getPort } from "@dither-booth/ports";
import USB from "@node-escpos/usb-adapter";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import http from "node:http";
import puppeteer from "puppeteer";

import { db } from "./db";

let printerDevice: USB | undefined;
let browser: Browser | undefined;
let receiptPageSlot: ReceiptPageSlot | undefined;

const launchOptions = getPuppeteerLaunchOptions();

let relaunchPuppeteerInFlight: Promise<Browser | undefined> | undefined;

const relaunchPuppeteerBrowser = async (): Promise<Browser | undefined> => {
  if (relaunchPuppeteerInFlight) {
    return relaunchPuppeteerInFlight;
  }

  relaunchPuppeteerInFlight = (async () => {
    try {
      await receiptPageSlot?.dispose();
    } catch {
      /* ignore */
    }
    receiptPageSlot = undefined;

    try {
      await browser?.close();
    } catch {
      /* ignore */
    }
    browser = undefined;

    try {
      browser = await puppeteer.launch(launchOptions);
      receiptPageSlot = createReceiptPageSlot(browser);
      logKioskEvent("warn", API_BROWSER_LOG_SOURCE, "browser-relaunched", {
        details: {},
      });
      return browser;
    } catch (error) {
      logKioskEvent("error", API_BROWSER_LOG_SOURCE, "browser-relaunch-failed", {
        error: getKioskErrorDiagnostics(error, "Browser relaunch failed."),
      });
      return undefined;
    } finally {
      relaunchPuppeteerInFlight = undefined;
    }
  })();

  return relaunchPuppeteerInFlight;
};

try {
  printerDevice = new USB();
} catch (error) {
  logKioskEvent("error", API_PRINTER_LOG_SOURCE, "printer-init-failed", {
    error: getKioskErrorDiagnostics(error, "Printer initialization failed."),
  });
}

try {
  browser = await puppeteer.launch(launchOptions);
  receiptPageSlot = createReceiptPageSlot(browser);
} catch (error) {
  logKioskEvent("error", API_BROWSER_LOG_SOURCE, "browser-init-failed", {
    error: getKioskErrorDiagnostics(error, "Browser initialization failed."),
  });
}

const createContext = (): TRPCContext => ({
  printerDevice,
  browser,
  receiptPageSlot,
  getPuppeteerBrowser: () => browser,
  getReceiptPageSlot: () => receiptPageSlot,
  relaunchPuppeteerBrowser,
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
      error: getKioskErrorDiagnostics(error, error.message || "API request failed."),
    });
  },
});

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
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
