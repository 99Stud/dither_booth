import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { TRPCError } from "@trpc/server";
import { octetInputParser } from "@trpc/server/http";

import { LOTTERY_LOG_SOURCE } from "#domains/lottery/internal/lottery.constants";
import { executeLotteryDraw } from "#domains/lottery/internal/lottery.draw";
import type { DrawResult } from "#domains/lottery/internal/lottery.types";
import { printRasterReceipt } from "#domains/printer/printer.service";
import { publicProcedure } from "#internal/trpc";
import { API_PRINTER_LOG_SOURCE } from "#lib/printer/printer.constants";

import {
  buildLotteryTicketRasterCommand,
  createBoothTicketRef,
  prepareReceiptRasterCommand,
} from "../internal/receipt-raster.utils";

export const printReceipt = publicProcedure
  .input(octetInputParser)
  .mutation(async ({ ctx, input }): Promise<DrawResult> => {
    const printerUSBAdapter = ctx.printerUSBAdapter;
    const page = ctx.page;

    if (!printerUSBAdapter) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "No printer device available.",
      });
    }

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

    const receiptRasterCmd = await prepareReceiptRasterCommand({
      ctx,
      input,
      printConfiguration,
    });

    await printRasterReceipt(printerUSBAdapter, receiptRasterCmd).catch(
      (error) => {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to print receipt.",
          cause: error,
        });
      },
    );

    let draw: DrawResult;

    try {
      draw = await executeLotteryDraw({ db: ctx.db });
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to execute lottery draw.",
        cause: error,
      });
    }

    const ticketRef = createBoothTicketRef();

    try {
      const lotteryRasterCmd = await buildLotteryTicketRasterCommand({
        page,
        printConfiguration,
        draw,
        ticketRef,
      });

      await printRasterReceipt(printerUSBAdapter, lotteryRasterCmd);
    } catch (error) {
      logKioskEvent("error", LOTTERY_LOG_SOURCE, "lottery-ticket-print-failed", {
        details: {
          outcome: draw.outcome,
          ticketRef,
        },
        error: getKioskErrorDiagnostics(
          error,
          "Failed to print lottery ticket after photo receipt.",
        ),
      });
      logKioskEvent("error", API_PRINTER_LOG_SOURCE, "lottery-ticket-print-failed", {
        details: {
          outcome: draw.outcome,
          ticketRef,
        },
        error: getKioskErrorDiagnostics(
          error,
          "Failed to print lottery ticket after photo receipt.",
        ),
      });

      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to print lottery ticket.",
        cause: error,
      });
    }

    return draw;
  });
