import type { ScreenshotOptions } from "puppeteer";

export const DEFAULT_SCREENSHOT_OPTIONS: ScreenshotOptions = {
  type: "webp",
  quality: 100,
  optimizeForSpeed: true,
  encoding: "base64",
};

export const DEFAULT_RECEIPT_VIEWER_URL =
  "http://localhost:9998/receipt-viewer";
export const BOOTH_PHOTO_SELECTOR = "img#booth-photo";
export const RECEIPT_SELECTOR = "div#receipt";
