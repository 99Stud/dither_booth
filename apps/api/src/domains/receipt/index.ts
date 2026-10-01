import { generateReceipt } from "./mutations/generate-receipt";
import { prepareReceipt } from "./mutations/prepare-receipt";
import { printPreparedReceipt } from "./mutations/print-prepared-receipt";
import { printReceipt } from "./mutations/print-receipt";

export const receipt = {
  generateReceipt,
  prepareReceipt,
  printPreparedReceipt,
  printReceipt,
};
