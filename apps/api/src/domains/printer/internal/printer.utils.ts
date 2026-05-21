import type USB from "@node-escpos/usb-adapter";

import { Printer } from "@node-escpos/core";

import { withTimeout } from "#lib/misc/misc.utils";

import type {
  CloseablePrinter,
  CreateReceiptPrinter,
  ReceiptPrinter,
} from "./printer.types";

import {
  PRINTER_FLUSH_TIMEOUT_MS,
  PRINTER_INITIALIZE_COMMAND,
  PRINTER_OPEN_TIMEOUT_MS,
} from "./printer.constants";

let printerJobQueue: Promise<void> = Promise.resolve();

export async function runExclusivePrinterJob<T>(
  job: () => Promise<T>,
): Promise<T> {
  const previousJob = printerJobQueue;
  let releaseCurrentJob: () => void = () => {};

  printerJobQueue = new Promise<void>((resolve) => {
    releaseCurrentJob = resolve;
  });

  await previousJob;

  try {
    return await job();
  } finally {
    releaseCurrentJob();
  }
}

async function openPrinterDevice(
  printerUSBAdapter: USB,
  timeoutMs = PRINTER_OPEN_TIMEOUT_MS,
): Promise<void> {
  if (!printerUSBAdapter.device) {
    throw new Error("Printer device is detached.");
  }

  await withTimeout({
    message: "Printer open timed out.",
    promise: new Promise<void>((resolve, reject) => {
      printerUSBAdapter.open((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    }),
    timeoutMs,
  });
}

export async function closePrinterWithTimeout(
  printer: CloseablePrinter,
  device: USB,
  timeoutMs = PRINTER_FLUSH_TIMEOUT_MS,
): Promise<void> {
  try {
    await withTimeout({
      message: "Printer flush timed out.",
      promise: printer.close(),
      timeoutMs,
    });
  } catch (error) {
    try {
      device.close();
    } catch {
      /* ignore */
    }
    throw error;
  }
}

const createReceiptPrinter: CreateReceiptPrinter = (device) => {
  return new Printer(device, {
    encoding: "US-ASCII",
  });
};

type PrintRasterReceiptOptions = {
  createPrinter?: CreateReceiptPrinter;
  openTimeoutMs?: number;
};

export async function printRasterReceipt(
  printerUSBAdapter: USB,
  rasterCommand: Buffer,
  options: PrintRasterReceiptOptions = {},
): Promise<void> {
  await runExclusivePrinterJob(async () => {
    let closeAttempted = false;
    let printer: ReceiptPrinter | undefined;
    const createPrinter = options.createPrinter ?? createReceiptPrinter;

    try {
      await openPrinterDevice(printerUSBAdapter, options.openTimeoutMs);

      printer = createPrinter(printerUSBAdapter);

      printer.raw(PRINTER_INITIALIZE_COMMAND);
      printer.align("ct");
      printer.raw(rasterCommand);
      printer.feed(2);
      printer.cut();

      closeAttempted = true;
      await closePrinterWithTimeout(printer, printerUSBAdapter);
    } catch (error) {
      if (printer && !closeAttempted) {
        await closePrinterWithTimeout(printer, printerUSBAdapter).catch(() => {
          /* ignore */
        });
      }

      if (!printer) {
        try {
          printerUSBAdapter.close();
        } catch {
          /* ignore */
        }
      }

      throw error;
    }
  });
}
