import { print } from "./mutations/print";
import {
  onPrintTicketSequence,
  printTicketSequence,
  registerPrintTicketSequence,
} from "./mutations/print-ticket-sequence";

export const printer = {
  print,
  printTicketSequence,
  registerPrintTicketSequence,
  onPrintTicketSequence,
};
