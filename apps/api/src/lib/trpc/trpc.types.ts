import type USB from "@node-escpos/usb-adapter";
import type { Page } from "puppeteer";

import type { DB } from "#db/internal/db.types";
import type { RuntimeProcessManager } from "#lib/process-manager/process-manager.types";
import type {
  PuppeteerReceiptViewerLifecycle,
  PuppeteerStartupState,
} from "#lib/puppeteer/puppeteer.types";

export type TRPCContext = {
  adminOrigin: string;
  db: DB;
  mode: "development" | "production";
  requestOrigin?: string;
  processManager: RuntimeProcessManager;
  puppeteerLifecycle: PuppeteerReceiptViewerLifecycle;
  puppeteerState: PuppeteerStartupState;
  printerUSBAdapter?: USB;
  page?: Page;
};
