import type { DB } from "#db/internal/db.types.ts";
import type { ReceiptPageSlot } from "#domains/browser-automation/internal/puppeteer-automation.ts";
import type USB from "@node-escpos/usb-adapter";
import type { Browser } from "puppeteer";

export type TRPCContext = {
  db: DB;
  printerDevice?: USB;
  browser?: Browser;
  receiptPageSlot?: ReceiptPageSlot;
};
