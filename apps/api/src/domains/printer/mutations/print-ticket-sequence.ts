import { db } from "#db/index.ts";
import {
  streamPrintImageSequence,
  type PrintSequenceStreamEvent,
} from "#domains/printer/internal/printer.utils.ts";
import { publicProcedure } from "#internal/trpc.ts";
import type { TRPCContext } from "#lib/trpc/trpc.types.ts";
import { API_PRINTER_LOG_SOURCE } from "#lib/printer/printer.constants.ts";
import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const roundMs = (since: number) => Math.round((performance.now() - since) * 100) / 100;

export const printTicketSequenceInputSchema = z.object({
  receiptImage: z.string().min(1),
  lotteryTicketImage: z.string().min(1),
  clientFlowId: z.string().uuid().optional(),
});

export type PrintTicketSequenceProgress = {
  step:
    | "load_config"
    | "decode"
    | "prepare_receipt"
    | "prepare_lottery"
    | "printing_receipt"
    | "printing_lottery";
};

const mapSequenceEvent = (ev: PrintSequenceStreamEvent): PrintTicketSequenceProgress => {
  if (ev.type === "prepare") {
    return ev.index === 0
      ? { step: "prepare_receipt" }
      : { step: "prepare_lottery" };
  }
  return ev.index === 0 ? { step: "printing_receipt" } : { step: "printing_lottery" };
};

async function* runPrintTicketSequence(
  opts: { ctx: TRPCContext },
  input: z.infer<typeof printTicketSequenceInputSchema>,
): AsyncGenerator<PrintTicketSequenceProgress, void, undefined> {
  const { ctx: procedureCtx } = opts;

  const mutationStartedAt = performance.now();

  yield { step: "load_config" };

  const dbStartedAt = performance.now();
  const ditherConfiguration = await db.query.printConfigTable.findFirst();
  const loadPrintConfigMs = roundMs(dbStartedAt);

  if (!ditherConfiguration) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Dither configuration not found.",
    });
  }

  const device = procedureCtx.printerDevice;
  if (!device) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "No printer device available.",
    });
  }

  yield { step: "decode" };

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
    for await (const ev of streamPrintImageSequence(device, [
      { buffer: receiptBuffer, ditherConfiguration },
      { buffer: lotteryBuffer, ditherConfiguration },
    ])) {
      yield mapSequenceEvent(ev);
    }

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
}

export const printTicketSequence = publicProcedure
  .input(printTicketSequenceInputSchema)
  .mutation(async ({ ctx, input }) => {
    for await (const _ of runPrintTicketSequence({ ctx }, input)) {
      /* mutation drains streamed progress */
    }
  });

export const onPrintTicketSequence = publicProcedure
  .input(printTicketSequenceInputSchema)
  .subscription(async function* ({ ctx, input, signal }) {
    for await (const ev of runPrintTicketSequence({ ctx }, input)) {
      if (signal?.aborted) {
        return;
      }
      yield ev;
    }
  });
