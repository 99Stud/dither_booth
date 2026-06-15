import type { Browser, Page } from "puppeteer";

export type PuppeteerReceiptViewerNavigationDetails = {
  path: string;
  url?: string;
};

export type PuppeteerStartupStage<
  TDetails extends object = Record<string, never>,
> = {
  ok: boolean;
  cause?: string;
  message?: string;
  details?: TDetails;
};

export type PuppeteerStartupState = {
  launch: PuppeteerStartupStage;
  page: PuppeteerStartupStage;
  navigation: PuppeteerStartupStage<PuppeteerReceiptViewerNavigationDetails>;
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
