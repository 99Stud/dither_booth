import { db } from "#db/index.ts";
import { printImageToDevice } from "#domains/printer/internal/printer.utils.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { API_PRINTER_LOG_SOURCE } from "#lib/printer/printer.constants.ts";
import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { TRPCError } from "@trpc/server";
import { octetInputParser } from "@trpc/server/http";

export const print = publicProcedure
  .input(octetInputParser)
  .mutation(async ({ ctx, input }) => {
    const inputBuffer = Buffer.from(await new Response(input).arrayBuffer());

    if (inputBuffer.byteLength === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Photo input was empty.",
      });
    }

    const ditherConfiguration = await db.query.printConfigTable.findFirst();

    if (!ditherConfiguration) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Dither configuration not found.",
      });
    }

    const device = ctx.printerDevice;

    if (!device) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "No printer device available.",
      });
    }

    try {
      await printImageToDevice(device, inputBuffer, ditherConfiguration);
    } catch (error) {
      logKioskEvent("error", API_PRINTER_LOG_SOURCE, "print-photo-failed", {
        error: getKioskErrorDiagnostics(error, "Failed to print photo."),
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to print photo.",
        cause: error,
      });
    }
  });
