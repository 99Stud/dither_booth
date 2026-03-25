import { publicProcedure } from "#trpc.ts";
import { Printer } from "@node-escpos/core";
import { TRPCError } from "@trpc/server";

export const print = publicProcedure.mutation(({ ctx }) => {
  const device = ctx.printerDevice;

  if (!device) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "No printer device available.",
    });
  }

  console.log("Printing...");
  device.open(async (err) => {
    if (err) {
      console.error(err);
      return;
    }
    const printer = new Printer(device, {
      encoding: "US-ASCII",
    });

    printer.text("Hello, world!");
    printer.cut();
    printer.close();
  });
});
