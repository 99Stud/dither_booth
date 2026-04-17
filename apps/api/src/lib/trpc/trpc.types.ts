import type { DB } from "#db/internal/db.types.ts";
import type { ReceiptPageSlot } from "#domains/browser-automation/internal/puppeteer-automation.ts";
import type USB from "@node-escpos/usb-adapter";
import type { Browser } from "puppeteer";

export type TRPCContext = {
  db: DB;
  printerDevice?: USB;
  browser?: Browser;
  receiptPageSlot?: ReceiptPageSlot;
  /** Live Puppeteer browser (survives relaunch mid-request). Prefer over `browser`. */
  getPuppeteerBrowser?: () => Browser | undefined;
  getReceiptPageSlot?: () => ReceiptPageSlot | undefined;
  /** Dispose slot, close Chromium, launch a new browser + receipt slot. */
  relaunchPuppeteerBrowser?: () => Promise<Browser | undefined>;
};
