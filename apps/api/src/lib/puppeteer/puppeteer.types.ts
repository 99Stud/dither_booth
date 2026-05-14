import type { Browser, Page } from "puppeteer";

export type PuppeteerStartupStage = {
  ok: boolean;
  message?: string;
  details?: Record<string, unknown>;
};

export type PuppeteerStartupState = {
  launch: PuppeteerStartupStage;
  page: PuppeteerStartupStage;
  navigation: PuppeteerStartupStage;
};

export type PuppeteerReceiptViewer = {
  browser?: Browser;
  page?: Page;
  state: PuppeteerStartupState;
};

export type PuppeteerReceiptViewerRestartResult = {
  ok: boolean;
  state: PuppeteerStartupState;
};

export type PuppeteerReceiptViewerLifecycle = {
  close: () => Promise<void>;
  getCurrent: () => PuppeteerReceiptViewer;
  initialize: () => Promise<PuppeteerReceiptViewer>;
  restart: () => Promise<PuppeteerReceiptViewerRestartResult>;
};
