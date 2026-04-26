import type { DB } from "#db/internal/db.types";
import type USB from "@node-escpos/usb-adapter";
import type { Page } from "puppeteer";

export type TRPCContext = {
  db: DB;
  printerDevice?: USB;
  page?: Page;
};
