export {
  type BoothPrinter,
  createBoothPrinter,
} from "./internal/booth-printer";
export { createPrinterMaintenancePolicy } from "./internal/printer-maintenance-policy";
export { PrinterUnavailableError } from "./internal/printer.transport";
export { createUsbPrinterTransport } from "./internal/printer.transport.usb";
export type { PrinterCondition, PrinterStatus } from "./internal/printer.types";
