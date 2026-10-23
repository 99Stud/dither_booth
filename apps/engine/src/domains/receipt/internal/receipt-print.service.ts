import type { DrawResult } from "@dither-booth/shared/lottery";

import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { TRPCError } from "@trpc/server";

import type { TRPCContext } from "#lib/trpc/trpc.types";

import { getReceiptEventSettingsForDb } from "#domains/event/event.service";
import {
  createBoothTicketRef,
  executeLotteryDraw,
  LOTTERY_LOG_SOURCE,
} from "#domains/lottery/lottery.service";
import { PrinterUnavailableError } from "#domains/printer/printer.service";
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

/** Sends one raster to the printer. */
export type PrintRaster = (raster: Buffer) => Promise<void>;

/** A printer that can't take the job: the booth shows it, the kiosk doesn't retry blindly. */
const toPrinterNotReady = (error: PrinterUnavailableError) =>
  new TRPCError({
    code: "PRECONDITION_FAILED",
    message: error.message,
    cause: error,
  });

/**
 * Checks the printer before anything is spent: the photo booth calls it
 * before the lottery draw, so a booth out of paper never burns a prize.
 * With automatic maintenance off (a sensor staff don't trust), only a
 * printer that isn't connected is refused.
 */
export const assertPrinterAvailable = (
  ctx: Pick<TRPCContext, "kioskMaintenance" | "printer">,
): { dryRun: boolean; print: PrintRaster } => {
  const dryRun = isReceiptPrintDryRun();
  const enforceStatus = ctx.kioskMaintenance.get().automatic;
  const print: PrintRaster = (raster) =>
    ctx.printer.print(raster, { enforceStatus });

  if (dryRun) return { dryRun, print };

  const { canPrint, conditions } = ctx.printer.getStatus();
  const refused = enforceStatus
    ? !canPrint
    : conditions.includes("disconnected");

  if (refused) throw toPrinterNotReady(new PrinterUnavailableError(conditions));

  return { dryRun, print };
};

const toPrintError = (error: unknown, message: string) => {
  if (error instanceof TRPCError) return error;
  if (error instanceof PrinterUnavailableError) return toPrinterNotReady(error);

  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message,
    cause: error,
  });
};

type PhotoReceiptInput = ConstructorParameters<typeof Response>[0];

const loadPrintConfiguration = async (db: TRPCContext["db"]) => {
  const printConfiguration = await db.query.printConfigTable.findFirst();

  if (!printConfiguration) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Print configuration not found.",
    });
  }

  return printConfiguration;
};

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

  const printConfiguration = await loadPrintConfiguration(ctx.db);
  const photoBuffer = Buffer.from(await new Response(input).arrayBuffer());

  if (photoBuffer.byteLength === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Photo input was empty.",
    });
  }

  const { kitId, ticketItems } = await getReceiptEventSettingsForDb(ctx.db);

  return { kitId, page, photoBuffer, printConfiguration, ticketItems };
};

export const prepareReceiptJob = async ({
  ctx,
  input,
}: {
  ctx: Pick<TRPCContext, "db" | "puppeteerLifecycle">;
  input: PhotoReceiptInput;
}): Promise<PreparedReceiptJob> => {
  const { kitId, page, photoBuffer, printConfiguration, ticketItems } =
    await loadPhotoReceiptSources({ ctx, input });
  let ticketRef = createBoothTicketRef();
  let receiptRasterCmd = await buildReceiptRasterCommand({
    kitId,
    page,
    photoBuffer,
    printConfiguration,
    ticketItems,
    ticketRef,
    upsideDown: printConfiguration.upsideDown,
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
      kitId,
      page,
      photoBuffer,
      printConfiguration,
      ticketItems,
      ticketRef,
      upsideDown: printConfiguration.upsideDown,
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
      kitId,
      page,
      draw,
      ticketRef,
      upsideDown: printConfiguration.upsideDown,
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
  print,
}: {
  dryRun: boolean;
  job: PreparedReceiptJob;
  print: PrintRaster;
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

  if (!job.photoPrinted) {
    await print(job.receiptRasterCmd).catch((error) => {
      throw toPrintError(error, "Failed to print receipt.");
    });
    job.photoPrinted = true;
  }

  if (!job.lotteryRasterCmd) return;

  try {
    await print(job.lotteryRasterCmd);
  } catch (error) {
    logLotteryTicketFailure(
      job,
      error,
      "Failed to print lottery ticket after photo receipt.",
    );

    throw toPrintError(error, "Failed to print lottery ticket.");
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
  ctx: Pick<
    TRPCContext,
    "db" | "kioskMaintenance" | "printer" | "puppeteerLifecycle"
  >;
  input: PhotoReceiptInput;
}): Promise<void> => {
  const { dryRun, print } = assertPrinterAvailable(ctx);
  const { kitId, page, photoBuffer, printConfiguration, ticketItems } =
    await loadPhotoReceiptSources({ ctx, input });

  const receiptRasterCmd = await buildReceiptRasterCommand({
    kitId,
    page,
    photoBuffer,
    printConfiguration,
    ticketItems,
    ticketRef: SAMPLE_LOTTERY_TICKET_REF,
    upsideDown: printConfiguration.upsideDown,
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
    print,
  });
};

export const printSampleLotteryTicketJob = async ({
  ctx,
  draw,
}: {
  ctx: Pick<
    TRPCContext,
    "db" | "kioskMaintenance" | "printer" | "puppeteerLifecycle"
  >;
  draw: DrawResult;
}): Promise<void> => {
  const { dryRun, print } = assertPrinterAvailable(ctx);
  const { page } = await ctx.puppeteerLifecycle.whenReady();

  if (!page) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Puppeteer page is not initialized.",
    });
  }

  const { kitId } = await getReceiptEventSettingsForDb(ctx.db);
  const { upsideDown } = await loadPrintConfiguration(ctx.db);
  const lotteryRasterCmd = await buildLotteryTicketRasterCommand({
    draw,
    kitId,
    page,
    ticketRef: SAMPLE_LOTTERY_TICKET_REF,
    upsideDown,
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

  try {
    await print(lotteryRasterCmd);
  } catch (error) {
    throw toPrintError(error, "Failed to print sample lottery ticket.");
  }
};
