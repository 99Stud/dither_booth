export {
  type BoothPrinter,
  createBoothPrinter,
} from "./internal/booth-printer";
export { buildTextTicket, type TicketLine } from "./internal/printer.escpos";
export { createPrinterMaintenancePolicy } from "./internal/printer-maintenance-policy";
export { PrinterUnavailableError } from "./internal/printer.transport";
export { createUsbPrinterTransport } from "./internal/printer.transport.usb";
export type { PrinterCondition, PrinterStatus } from "./internal/printer.types";
