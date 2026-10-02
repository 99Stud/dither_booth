import type USB from "@node-escpos/usb-adapter";

import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import type { DrawResult } from "#domains/lottery/internal/lottery.types";
import type { TRPCContext } from "#lib/trpc/trpc.types";

import { lotteryTable } from "#db/internal/db.schema";
import { LOTTERY_LOG_SOURCE } from "#domains/lottery/internal/lottery.constants";
import { executeLotteryDraw } from "#domains/lottery/internal/lottery.draw";
import { createBoothTicketRef } from "#domains/lottery/internal/lottery.ticket-ref";
import { printRasterReceipt } from "#domains/printer/printer.service";
import { API_PRINTER_LOG_SOURCE } from "#lib/printer/printer.constants";
import { isReceiptPrintDryRun } from "#lib/runtime-flags/runtime-flags";

import { previewReceiptRasters } from "./receipt-dry-run.utils";
import {
  buildLotteryTicketRasterCommand,
  buildReceiptRasterCommand,
} from "./receipt-raster.utils";

/**
 * Everything the printer needs for one booth visit, with the lottery draw
 * already committed. Built right after capture so the kiosk can play the slot
 * machine with the real outcome, and printed once the game is over.
 */
export interface PreparedReceiptJob {
  draw: DrawResult;
  lotteryRasterCmd: Buffer | null;
  receiptRasterCmd: Buffer;
  ticketRef: string;
}

const logLotteryTicketFailure = (
  job: Pick<PreparedReceiptJob, "draw" | "ticketRef">,
  error: unknown,
  message: string,
) => {
  const payload = {
    details: {
      outcome: job.draw.outcome,
      ticketRef: job.ticketRef,
    },
    error: getKioskErrorDiagnostics(error, message),
  };

  logKioskEvent(
    "error",
    LOTTERY_LOG_SOURCE,
    "lottery-ticket-print-failed",
    payload,
  );
  logKioskEvent(
    "error",
    API_PRINTER_LOG_SOURCE,
    "lottery-ticket-print-failed",
    payload,
  );
};

export const assertPrinterAvailable = (
  ctx: Pick<TRPCContext, "printerUSBAdapter">,
): { dryRun: boolean; printerUSBAdapter: USB | undefined } => {
  const dryRun = isReceiptPrintDryRun();

  if (!dryRun && !ctx.printerUSBAdapter) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "No printer device available.",
    });
  }

  return { dryRun, printerUSBAdapter: ctx.printerUSBAdapter };
};

export const prepareReceiptJob = async ({
  ctx,
  input,
}: {
  ctx: Pick<TRPCContext, "db" | "puppeteerLifecycle">;
  input: ConstructorParameters<typeof Response>[0];
}): Promise<PreparedReceiptJob> => {
  const { page } = await ctx.puppeteerLifecycle.whenReady();

  if (!page) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Puppeteer page is not initialized.",
    });
  }

  const printConfiguration = await ctx.db.query.printConfigTable.findFirst();

  if (!printConfiguration) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Print configuration not found.",
    });
  }

  const photoBuffer = Buffer.from(await new Response(input).arrayBuffer());

  if (photoBuffer.byteLength === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Photo input was empty.",
    });
  }

  let ticketRef = createBoothTicketRef();
  let receiptRasterCmd = await buildReceiptRasterCommand({
    page,
    photoBuffer,
    printConfiguration,
    ticketRef,
  });

  let execution;

  try {
    execution = await executeLotteryDraw({ db: ctx.db, ticketRef });
  } catch (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to execute lottery draw.",
      cause: error,
    });
  }

  // The draw can land on a different ref when ours collided; the receipt has
  // to carry the ref that was actually recorded.
  if (execution.ticketRef !== ticketRef) {
    ticketRef = execution.ticketRef;
    receiptRasterCmd = await buildReceiptRasterCommand({
      page,
      photoBuffer,
      printConfiguration,
      ticketRef,
    });
  }

  const draw = execution.result;

  const lottery = await ctx.db.query.lotteryTable.findFirst({
    where: eq(lotteryTable.enabled, true),
  });
  const printLoserTicket = lottery?.printLoserTicket ?? false;
  const shouldPrintLotteryTicket = draw.outcome === "win" || printLoserTicket;

  if (!shouldPrintLotteryTicket) {
    return { draw, lotteryRasterCmd: null, receiptRasterCmd, ticketRef };
  }

  try {
    const lotteryRasterCmd = await buildLotteryTicketRasterCommand({
      page,
      draw,
      ticketRef,
    });

    return { draw, lotteryRasterCmd, receiptRasterCmd, ticketRef };
  } catch (error) {
    logLotteryTicketFailure(
      { draw, ticketRef },
      error,
      "Failed to generate lottery ticket after photo receipt.",
    );

    if (error instanceof TRPCError) {
      throw error;
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to print lottery ticket.",
      cause: error,
    });
  }
};

export const printPreparedReceiptJob = async ({
  dryRun,
  job,
  printerUSBAdapter,
}: {
  dryRun: boolean;
  job: PreparedReceiptJob;
  printerUSBAdapter: USB | undefined;
}): Promise<void> => {
  if (dryRun) {
    try {
      await previewReceiptRasters({
        lotteryRasterCmd: job.lotteryRasterCmd ?? undefined,
        photoRasterCmd: job.receiptRasterCmd,
        ticketRef: job.ticketRef,
      });
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to preview receipt dry-run outputs.",
        cause: error,
      });
    }

    return;
  }

  if (!printerUSBAdapter) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "No printer device available.",
    });
  }

  await printRasterReceipt(printerUSBAdapter, job.receiptRasterCmd).catch(
    (error) => {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to print receipt.",
        cause: error,
      });
    },
  );

  if (!job.lotteryRasterCmd) return;

  try {
    await printRasterReceipt(printerUSBAdapter, job.lotteryRasterCmd);
  } catch (error) {
    logLotteryTicketFailure(
      job,
      error,
      "Failed to print lottery ticket after photo receipt.",
    );

    if (error instanceof TRPCError) {
      throw error;
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to print lottery ticket.",
      cause: error,
    });
  }
};
