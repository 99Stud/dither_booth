import type { KitId } from "@dither-booth/shared/kits";
import type { DrawResult } from "@dither-booth/shared/lottery";
import type { Page } from "puppeteer";

import { PRINT_WIDTH_PX } from "@dither-booth/shared/printing";
import { LOTTERY_RECEIPT_TEMPLATE } from "@dither-booth/shared/routes";
import { TRPCError } from "@trpc/server";

import type { PrintConfigRow } from "#domains/print-configuration/print-configuration.service";
import type { PuppeteerReceiptViewerLifecycle } from "#lib/puppeteer/puppeteer.types";

import { ditherImage } from "#domains/image-manipulation/image-manipulation.service";
import { screenshotToGsV0RasterCommand } from "#domains/printer/printer.service";

import {
  captureLotteryTicketScreenshot,
  captureReceiptScreenshot,
  createReceiptViewerPageQueue,
  type ReceiptViewerPageQueue,
} from "./receipt-viewer-page.utils";

/** What a photo receipt shows. */
export type PhotoReceiptRender = {
  photo: Buffer<ArrayBuffer>;
  /** The event's kit, which picks how the ticket looks. */
  kitId: KitId;
  ticketItems: string[];
  printConfiguration: PrintConfigRow;
  /** None on the Darkroom's preview. */
  ticketRef?: string;
  /** Rotate 180° for the printer (`print_config.upside_down`). */
  upsideDown: boolean;
};

/** What a lottery ticket shows. */
export type LotteryTicketRender = {
  /** The event's kit, which picks how the ticket looks. */
  kitId: KitId;
  draw: DrawResult;
  ticketRef: string;
  /** Rotate 180° for the printer (`print_config.upside_down`). */
  upsideDown: boolean;
};

/**
 * Turns a ticket into the `GS v 0` raster the printer takes: the receipt
 * viewer page in Chromium on the booth, a fake in tests.
 */
export type TicketRenderer = {
  renderPhotoReceipt: (render: PhotoReceiptRender) => Promise<Buffer>;
  renderLotteryTicket: (render: LotteryTicketRender) => Promise<Buffer>;
};

const RECEIPT_GENERATION_FAILED_MESSAGE = "Failed to generate receipt.";
const LOTTERY_TICKET_GENERATION_FAILED_MESSAGE =
  "Failed to generate lottery ticket.";

/**
 * Caps the puppeteer stage, whose navigation and element lookups are already
 * bounded individually but whose screenshot is not. The sharp stages around it
 * stay unbounded on purpose — see PRINT_ATTEMPT_TIMEOUT_MS for the budget this
 * feeds and what it does and does not cover.
 */
const RECEIPT_SCREENSHOT_TIMEOUT_MS = 12_000;

/**
 * Renders on the receipt viewer page the Puppeteer lifecycle keeps open,
 * waiting for it after a restart, one ticket at a time.
 */
export function createPuppeteerTicketRenderer(
  lifecycle: Pick<PuppeteerReceiptViewerLifecycle, "whenReady">,
): TicketRenderer {
  const runPageJob = createReceiptViewerPageQueue();

  const readyPage = async () => {
    const { page } = await lifecycle.whenReady();

    if (!page) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Puppeteer page is not initialized.",
      });
    }

    return page;
  };

  return {
    renderPhotoReceipt: async (render) =>
      renderPhotoReceipt(await readyPage(), runPageJob, render),
    renderLotteryTicket: async (render) =>
      renderLotteryTicket(await readyPage(), runPageJob, render),
  };
}

async function renderPhotoReceipt(
  page: Page,
  runPageJob: ReceiptViewerPageQueue,
  {
    kitId,
    photo,
    printConfiguration,
    ticketItems,
    ticketRef,
    upsideDown,
  }: PhotoReceiptRender,
): Promise<Buffer> {
  const dithered = await ditherImage(photo, printConfiguration, {
    width: PRINT_WIDTH_PX,
  }).catch((error) => {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to process photo.",
      cause: error,
    });
  });

  try {
    const ditheredImageData = (
      await dithered.threshold(printConfiguration.threshold).png().toBuffer()
    ).toBase64();

    const receiptScreenshot = await runPageJob(
      () =>
        captureReceiptScreenshot({
          image: {
            data: ditheredImageData,
            mimeType: "image/png",
          },
          kitId,
          page,
          ticketItems,
          ticketRef,
        }),
      {
        timeoutMessage: "Receipt screenshot timed out.",
        timeoutMs: RECEIPT_SCREENSHOT_TIMEOUT_MS,
      },
    );

    return await screenshotToGsV0RasterCommand(receiptScreenshot, {
      upsideDown,
      width: PRINT_WIDTH_PX,
    }).catch((error) => {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to convert receipt screenshot to raster command.",
        cause: error,
      });
    });
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: RECEIPT_GENERATION_FAILED_MESSAGE,
      cause: error,
    });
  }
}

async function renderLotteryTicket(
  page: Page,
  runPageJob: ReceiptViewerPageQueue,
  { draw, kitId, ticketRef, upsideDown }: LotteryTicketRender,
): Promise<Buffer> {
  try {
    const lotteryScreenshot = await runPageJob(() =>
      captureLotteryTicketScreenshot({
        page,
        search: {
          template: LOTTERY_RECEIPT_TEMPLATE,
          kit: kitId,
          outcome: draw.outcome,
          wonAt: new Date().toISOString(),
          ...(draw.outcome === "win"
            ? {
                prizeId: draw.prize.id,
                title: draw.prize.title,
                winInstruction: draw.prize.winInstruction,
                prizeRarity: draw.prize.rarity,
              }
            : {}),
          ticketRef,
        },
      }),
    );

    return await screenshotToGsV0RasterCommand(lotteryScreenshot, {
      upsideDown,
      width: PRINT_WIDTH_PX,
    }).catch((error) => {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Failed to convert lottery ticket screenshot to raster command.",
        cause: error,
      });
    });
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: LOTTERY_TICKET_GENERATION_FAILED_MESSAGE,
      cause: error,
    });
  }
}
