import type { DB } from "#db/internal/db.types";
import type { RuntimeProcessManager } from "#lib/process-manager/process-manager.types";
import type { PuppeteerStartupState } from "#lib/puppeteer/puppeteer.types";
import type USB from "@node-escpos/usb-adapter";
import type { Page } from "puppeteer";

export type TRPCContext = {
  db: DB;
  mode: "development" | "production";
  processManager: RuntimeProcessManager;
  puppeteerState: PuppeteerStartupState;
  printerDevice?: USB;
  page?: Page;
};
