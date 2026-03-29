import { publicProcedure } from "#trpc.ts";
import { TRPCError } from "@trpc/server";

import { printImageSchema } from "./schema.ts";
import { printImageToDevice } from "./utils.ts";

export const print = publicProcedure
  .input(printImageSchema)
  .mutation(async ({ ctx, input }) => {
    const device = ctx.printerDevice;

    if (!device) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "No printer device available.",
      });
    }

    await printImageToDevice(device, input);
  });
