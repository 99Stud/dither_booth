import type { DB } from "#db/types.ts";
import type USB from "@node-escpos/usb-adapter";
import type { Page } from "puppeteer";

import { initTRPC } from "@trpc/server";

export interface Context {
  db: DB;
  printerDevice?: USB;
  page?: Page;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
