import type Printer from "@node-escpos/core";
import type USB from "@node-escpos/usb-adapter";

export type CloseablePrinter = Pick<Printer<[]>, "close">;

export type ReceiptPrinter = CloseablePrinter &
  Pick<Printer<[]>, "align" | "cut" | "feed" | "raw">;

export type CreateReceiptPrinter = (device: USB) => ReceiptPrinter;
