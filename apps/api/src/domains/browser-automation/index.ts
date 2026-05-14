import { generateReceipt } from "./mutations/generate-receipt";
import { restartPuppeteerReceiptViewer } from "./mutations/restart-puppeteer-receipt-viewer";

export const browserAutomation = {
  generateReceipt,
  restartPuppeteerReceiptViewer,
};
