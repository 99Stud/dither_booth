import type { DrawResult } from "@dither-booth/shared/lottery";
import type USB from "@node-escpos/usb-adapter";

import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { TRPCError } from "@trpc/server";

import type { TRPCContext } from "#lib/trpc/trpc.types";

import { getCurrentTicketItemNamesForDb } from "#domains/event/event.service";
import {
  createBoothTicketRef,
  executeLotteryDraw,
  LOTTERY_LOG_SOURCE,
} from "#domains/lottery/lottery.service";
import { printRasterReceipt } from "#domains/printer/printer.service";
import { ENGINE_PRINTER_LOG_SOURCE } from "#lib/printer/printer.constants";
import { isReceiptPrintDryRun } from "#lib/runtime-flags/runtime-flags";

import {
  previewLotteryTicketRaster,
  previewReceiptRasters,
} from "./receipt-dry-run.utils";
import {
  buildLotteryTicketRasterCommand,
  buildReceiptRasterCommand,
} from "./receipt-raster.utils";
import { SAMPLE_LOTTERY_TICKET_REF } from "./sample-lottery-ticket";

/**
 * Everything the printer needs for one booth visit, with the lottery draw
 * already committed. Built right after capture so the kiosk can play the slot
 * machine with the real outcome, and printed once the game is over.
 */
export interface PreparedReceiptJob {
  draw: DrawResult;
  lotteryRasterCmd: Buffer | null;
  /**
   * Set once the photo receipt is out, so a retry after a lottery-ticket
   * failure prints only the ticket instead of a second photo.
   */
  photoPrinted: boolean;
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
    ENGINE_PRINTER_LOG_SOURCE,
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

type PhotoReceiptInput = ConstructorParameters<typeof Response>[0];

/** What every photo receipt render needs, read and validated once. */
const loadPhotoReceiptSources = async ({
  ctx,
  input,
}: {
  ctx: Pick<TRPCContext, "db" | "puppeteerLifecycle">;
  input: PhotoReceiptInput;
}) => {
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

  const ticketItems = await getCurrentTicketItemNamesForDb(ctx.db);

  return { page, photoBuffer, printConfiguration, ticketItems };
};

export const prepareReceiptJob = async ({
  ctx,
  input,
}: {
  ctx: Pick<TRPCContext, "db" | "puppeteerLifecycle">;
  input: PhotoReceiptInput;
}): Promise<PreparedReceiptJob> => {
  const { page, photoBuffer, printConfiguration, ticketItems } =
    await loadPhotoReceiptSources({ ctx, input });
  let ticketRef = createBoothTicketRef();
  let receiptRasterCmd = await buildReceiptRasterCommand({
    page,
    photoBuffer,
    printConfiguration,
    ticketItems,
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
      ticketItems,
      ticketRef,
    });
  }

  const draw = execution.result;
  const job: PreparedReceiptJob = {
    draw,
    lotteryRasterCmd: null,
    photoPrinted: false,
    receiptRasterCmd,
    ticketRef,
  };

  if (draw.outcome === "loss" && !execution.printLoserTicket) {
    return job;
  }

  try {
    job.lotteryRasterCmd = await buildLotteryTicketRasterCommand({
      page,
      draw,
      ticketRef,
    });
  } catch (error) {
    // The draw is already committed. Failing here would drop the photo
    // receipt too, and with it the printed ticket ref staff use to look the
    // win up in admin Draws. Print the photo alone instead.
    logLotteryTicketFailure(
      { draw, ticketRef },
      error,
      "Failed to generate lottery ticket; printing the photo receipt alone.",
    );
  }

  return job;
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

  if (!job.photoPrinted) {
    await printRasterReceipt(printerUSBAdapter, job.receiptRasterCmd).catch(
      (error) => {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to print receipt.",
          cause: error,
        });
      },
    );
    job.photoPrinted = true;
  }

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

/**
 * Admin test print: the photo receipt only, under the sample ref `000000`.
 * It never draws, so tuning the printer cannot take prize stock or add a row
 * to the event's draws.
 */
export const printTestReceiptJob = async ({
  ctx,
  input,
}: {
  ctx: Pick<TRPCContext, "db" | "printerUSBAdapter" | "puppeteerLifecycle">;
  input: PhotoReceiptInput;
}): Promise<void> => {
  const { dryRun, printerUSBAdapter } = assertPrinterAvailable(ctx);
  const { page, photoBuffer, printConfiguration, ticketItems } =
    await loadPhotoReceiptSources({ ctx, input });

  const receiptRasterCmd = await buildReceiptRasterCommand({
    page,
    photoBuffer,
    printConfiguration,
    ticketItems,
    ticketRef: SAMPLE_LOTTERY_TICKET_REF,
  });

  await printPreparedReceiptJob({
    dryRun,
    job: {
      draw: { outcome: "loss", prize: null },
      lotteryRasterCmd: null,
      photoPrinted: false,
      receiptRasterCmd,
      ticketRef: SAMPLE_LOTTERY_TICKET_REF,
    },
    printerUSBAdapter,
  });
};

export const printSampleLotteryTicketJob = async ({
  ctx,
  draw,
}: {
  ctx: Pick<TRPCContext, "printerUSBAdapter" | "puppeteerLifecycle">;
  draw: DrawResult;
}): Promise<void> => {
  const { dryRun, printerUSBAdapter } = assertPrinterAvailable(ctx);
  const { page } = await ctx.puppeteerLifecycle.whenReady();

  if (!page) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Puppeteer page is not initialized.",
    });
  }

  const lotteryRasterCmd = await buildLotteryTicketRasterCommand({
    draw,
    page,
    ticketRef: SAMPLE_LOTTERY_TICKET_REF,
  });

  if (dryRun) {
    try {
      await previewLotteryTicketRaster({
        lotteryRasterCmd,
        ticketRef: `${draw.outcome}-${SAMPLE_LOTTERY_TICKET_REF}`,
      });
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to preview sample lottery ticket.",
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

  try {
    await printRasterReceipt(printerUSBAdapter, lotteryRasterCmd);
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to print sample lottery ticket.",
      cause: error,
    });
  }
};
