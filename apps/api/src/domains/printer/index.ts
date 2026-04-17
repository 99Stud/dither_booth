import { print } from "./mutations/print";
import { onPrintTicketSequence, printTicketSequence } from "./mutations/print-ticket-sequence";

export const printer = {
  print,
  printTicketSequence,
  onPrintTicketSequence,
};
