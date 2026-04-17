import { db } from "#db/index.ts";
import { printImageSequenceToDevice } from "#domains/printer/internal/printer.utils.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { API_PRINTER_LOG_SOURCE } from "#lib/printer/printer.constants.ts";
import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const roundMs = (since: number) => Math.round((performance.now() - since) * 100) / 100;

export const printTicketSequence = publicProcedure
  .input(
    z.object({
      receiptImage: z.string().min(1),
      lotteryTicketImage: z.string().min(1),
      clientFlowId: z.string().uuid().optional(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const mutationStartedAt = performance.now();

    const dbStartedAt = performance.now();
    const ditherConfiguration = await db.query.printConfigTable.findFirst();
    const loadPrintConfigMs = roundMs(dbStartedAt);

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

    const decodeStartedAt = performance.now();
    const receiptBuffer = Buffer.from(input.receiptImage, "base64");
    const lotteryBuffer = Buffer.from(input.lotteryTicketImage, "base64");
    const decodeBase64Ms = roundMs(decodeStartedAt);

    if (receiptBuffer.byteLength === 0 || lotteryBuffer.byteLength === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Image inputs must not be empty.",
      });
    }

    try {
      const printStartedAt = performance.now();
      await printImageSequenceToDevice(device, [
        { buffer: receiptBuffer, ditherConfiguration },
        { buffer: lotteryBuffer, ditherConfiguration },
      ]);
      logKioskEvent("info", API_PRINTER_LOG_SOURCE, "print-ticket-sequence-metrics", {
        details: {
          totalMs: roundMs(mutationStartedAt),
          loadPrintConfigMs,
          decodeBase64Ms,
          printPipelineMs: roundMs(printStartedAt),
          receiptBytes: receiptBuffer.byteLength,
          lotteryBytes: lotteryBuffer.byteLength,
          ...(input.clientFlowId ? { clientFlowId: input.clientFlowId } : {}),
        },
      });
    } catch (error) {
      logKioskEvent("error", API_PRINTER_LOG_SOURCE, "print-ticket-sequence-failed", {
        error: getKioskErrorDiagnostics(error, "Failed to print ticket sequence."),
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to print ticket sequence.",
        cause: error,
      });
    }
  });
