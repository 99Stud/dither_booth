import type USB from "@node-escpos/usb-adapter";

import { initTRPC } from "@trpc/server";

export interface Context {
  printerDevice?: USB;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
