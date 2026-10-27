import type { DrawResult } from "@dither-booth/shared/lottery";

import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { TRPCError } from "@trpc/server";

import type { DB } from "#db/internal/db.types";
import type { KioskMaintenance } from "#domains/kiosk/kiosk.service";
import type { BoothPrinter } from "#domains/printer/printer.service";
import type { Visits } from "#domains/visit/visit.service";

import { getReceiptEventSettingsForDb } from "#domains/event/event.service";
import {
  createBoothTicketRef,
  executeLotteryDraw,
  LOTTERY_LOG_SOURCE,
} from "#domains/lottery/lottery.service";
import {
  gsV0RasterCommandToPngBuffer,
  PrinterUnavailableError,
} from "#domains/printer/printer.service";
import { ENGINE_PRINTER_LOG_SOURCE } from "#lib/printer/printer.constants";

import type { TicketRenderer } from "./ticket-renderer";

import { createPreparedReceiptStore } from "./prepared-receipt.store";
import { SAMPLE_LOTTERY_TICKET_REF } from "./sample-lottery-ticket";

/** The photo as the Shutter or the Darkroom sends it. */
export type PhotoInput = ConstructorParameters<typeof Response>[0];

/** What the Shutter needs to play the slot machine. */
export type PreparedVisit = {
  draw: DrawResult;
  /** The draw ran against a lottery, so the kiosk plays the slot machine. */
  hasLottery: boolean;
  ticketRef: string;
  /** The guest's visit, or null when it couldn't be recorded. */
  visitId: string | null;
};

/**
 * Everything the printer needs for one visit, with the draw already
 * committed, held between `prepareVisit` and `printVisit`.
 */
export interface PreparedReceiptJob extends Omit<PreparedVisit, "visitId"> {
  lotteryRasterCmd: Buffer | null;
  /**
   * Set once the photo receipt is out, so a retry after a lottery-ticket
   * failure prints only the ticket instead of a second photo.
   */
  photoPrinted: boolean;
  receiptRasterCmd: Buffer;
}

/**
 * The tickets the receipt viewer renders: a visit's photo receipt and
 * lottery ticket, the Darkroom's test print and preview, and sample lottery
 * tickets. Errors are tRPC errors: `PRECONDITION_FAILED` when the printer
 * can't print, `NOT_FOUND`, `BAD_REQUEST` for an empty photo, otherwise
 * `INTERNAL_SERVER_ERROR`.
 */
export type Tickets = {
  /**
   * First half of a visit. Checks the printer before anything is spent, so
   * a booth out of paper never burns a prize, then commits the draw and
   * renders both tickets while the Shutter plays the slot machine. The draw
   * is linked to `visitId`, or to a visit started then when it's null.
   */
  prepareVisit: (
    photo: PhotoInput,
    visitId: string | null,
  ) => Promise<PreparedVisit>;
  /**
   * Second half: prints what `prepareVisit` rendered for `ticketRef`. A
   * failed print can be retried and never prints the photo receipt twice.
   * `NOT_FOUND` once printed in full, or after `PREPARED_RECEIPT_TTL_MS`.
   */
  printVisit: (ticketRef: string) => Promise<void>;
  /** The photo receipt under `000000`. Never draws or takes stock. */
  printTestPrint: (photo: PhotoInput) => Promise<void>;
  /** A lottery ticket for `draw` under `000000`. Never touches the lottery. */
  printSampleLotteryTicket: (draw: DrawResult) => Promise<void>;
  /** The photo receipt as a PNG, the right way up, without a ticket number. */
  previewPhotoReceipt: (photo: PhotoInput) => Promise<Buffer>;
};

type PrintRaster = (raster: Buffer) => Promise<void>;

/** A printer that can't take the job: the booth shows it, the kiosk doesn't retry blindly. */
const toPrinterNotReady = (error: PrinterUnavailableError) =>
  new TRPCError({
    code: "PRECONDITION_FAILED",
    message: error.message,
    cause: error,
  });

const toPrintError = (error: unknown, message: string) => {
  if (error instanceof TRPCError) return error;
  if (error instanceof PrinterUnavailableError) return toPrinterNotReady(error);

  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message,
    cause: error,
  });
};

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

export function createTickets({
  db,
  maintenance,
  printer,
  renderer,
  visits,
}: {
  db: DB;
  maintenance: Pick<KioskMaintenance, "get">;
  printer: Pick<BoothPrinter, "getStatus" | "print">;
  renderer: TicketRenderer;
  visits: Pick<Visits, "captured" | "printed">;
}): Tickets {
  const store = createPreparedReceiptStore();

  /**
   * Checks the printer before anything is spent. With automatic maintenance
   * off (a sensor staff don't trust), only a printer that isn't connected is
   * refused, and the job doesn't enforce the status either.
   */
  const checkPrinter = (): PrintRaster => {
    const enforceStatus = maintenance.get().automatic;
    const { canPrint, conditions } = printer.getStatus();
    const refused = enforceStatus
      ? !canPrint
      : conditions.includes("disconnected");

    if (refused) {
      throw toPrinterNotReady(new PrinterUnavailableError(conditions));
    }

    return (raster) => printer.print(raster, { enforceStatus });
  };

  const loadPrintConfiguration = async () => {
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
  const loadPhotoReceipt = async (input: PhotoInput) => {
    const photo = Buffer.from(await new Response(input).arrayBuffer());

    if (photo.byteLength === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Photo input was empty.",
      });
    }

    const printConfiguration = await loadPrintConfiguration();
    const { kitId, ticketItems } = await getReceiptEventSettingsForDb(db);

    return { kitId, photo, printConfiguration, ticketItems };
  };

  const printJob = async (job: PreparedReceiptJob, print: PrintRaster) => {
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

  return {
    async prepareVisit(input, requestedVisitId) {
      checkPrinter();

      const receipt = await loadPhotoReceipt(input);
      const upsideDown = receipt.printConfiguration.upsideDown;
      let ticketRef = createBoothTicketRef();
      let receiptRasterCmd = await renderer.renderPhotoReceipt({
        ...receipt,
        ticketRef,
        upsideDown,
      });

      let execution;
      let visitId: string | null = null;

      try {
        execution = await executeLotteryDraw({
          db,
          ticketRef,
          inTransaction: (tx, draw) => {
            visitId = visits.captured(tx, requestedVisitId, draw);
          },
        });
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to execute lottery draw.",
          cause: error,
        });
      }

      // The draw can land on a different ref when ours collided; the receipt
      // has to carry the ref that was actually recorded.
      if (execution.ticketRef !== ticketRef) {
        ticketRef = execution.ticketRef;
        receiptRasterCmd = await renderer.renderPhotoReceipt({
          ...receipt,
          ticketRef,
          upsideDown,
        });
      }

      const draw = execution.result;
      const job: PreparedReceiptJob = {
        draw,
        hasLottery: execution.hasLottery,
        lotteryRasterCmd: null,
        photoPrinted: false,
        receiptRasterCmd,
        ticketRef,
      };

      if (draw.outcome === "win" || execution.printLoserTicket) {
        try {
          job.lotteryRasterCmd = await renderer.renderLotteryTicket({
            draw,
            kitId: receipt.kitId,
            ticketRef,
            upsideDown,
          });
        } catch (error) {
          // The draw is already committed. Failing here would drop the photo
          // receipt too, and with it the printed ticket ref staff use to
          // look the win up in admin Draws. Print the photo alone instead.
          logLotteryTicketFailure(
            { draw, ticketRef },
            error,
            "Failed to generate lottery ticket; printing the photo receipt alone.",
          );
        }
      }

      store.put(job);

      return { draw, hasLottery: job.hasLottery, ticketRef, visitId };
    },

    async printVisit(ticketRef) {
      const print = checkPrinter();
      const job = store.take(ticketRef);

      if (!job) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No prepared receipt for ticket ${ticketRef}.`,
        });
      }

      try {
        await printJob(job, print);
      } catch (error) {
        // Taken out while printing so a double submit cannot print twice;
        // put back on failure so the kiosk can retry (only the unprinted
        // parts).
        store.put(job);
        visits.printed(ticketRef, false);
        throw error;
      }

      visits.printed(ticketRef, true);
    },

    async printTestPrint(input) {
      const print = checkPrinter();
      const receipt = await loadPhotoReceipt(input);
      const raster = await renderer.renderPhotoReceipt({
        ...receipt,
        ticketRef: SAMPLE_LOTTERY_TICKET_REF,
        upsideDown: receipt.printConfiguration.upsideDown,
      });

      await print(raster).catch((error) => {
        throw toPrintError(error, "Failed to print receipt.");
      });
    },

    async printSampleLotteryTicket(draw) {
      const print = checkPrinter();
      const { kitId } = await getReceiptEventSettingsForDb(db);
      const { upsideDown } = await loadPrintConfiguration();
      const raster = await renderer.renderLotteryTicket({
        draw,
        kitId,
        ticketRef: SAMPLE_LOTTERY_TICKET_REF,
        upsideDown,
      });

      await print(raster).catch((error) => {
        throw toPrintError(error, "Failed to print sample lottery ticket.");
      });
    },

    async previewPhotoReceipt(input) {
      const receipt = await loadPhotoReceipt(input);
      // A preview on screen, so it stays the right way up.
      const raster = await renderer.renderPhotoReceipt({
        ...receipt,
        upsideDown: false,
      });

      return await gsV0RasterCommandToPngBuffer(raster).catch((error) => {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to convert raster command to PNG buffer.",
          cause: error,
        });
      });
    },
  };
}
