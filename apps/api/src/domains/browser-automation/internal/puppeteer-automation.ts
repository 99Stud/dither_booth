import type { Browser, Page } from "puppeteer";

const VIEWPORT = {
  deviceScaleFactor: 2,
  width: 440,
  height: 1600,
} as const;

const GOTO_OPTIONS = {
  waitUntil: "load" as const,
  timeout: 120_000,
};

export function isTransientPuppeteerError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /detached|Target closed|Session closed|Protocol error|LifecycleWatcher|crashed|Renderer/i.test(
    msg,
  );
}

/**
 * One fresh page per automation run. A shared page often ends up with "frame detached"
 * on low-memory / kiosk setups after Chromium hiccups; isolating each job fixes that.
 */
export async function withAutomationPage<T>(
  browser: Browser,
  run: (page: Page) => Promise<T>,
): Promise<T> {
  const page = await browser.newPage();
  try {
    page.setDefaultNavigationTimeout(120_000);
    page.setDefaultTimeout(120_000);
    await page.setViewport(VIEWPORT);
    return await run(page);
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function gotoAutomation(page: Page, url: string): Promise<void> {
  await page.goto(url, GOTO_OPTIONS);
}

export async function runWithAutomationRetry<T>(
  browser: Browser,
  run: (page: Page) => Promise<T>,
): Promise<T> {
  try {
    return await withAutomationPage(browser, run);
  } catch (error) {
    if (isTransientPuppeteerError(error)) {
      return await withAutomationPage(browser, run);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Receipt page slot – keeps a single pre-warmed Page ready for screenshot
// ---------------------------------------------------------------------------

export type ReceiptPageSlot = {
  prime(url: string): Promise<void>;
  takeReadyPage(url: string): Promise<Page>;
  returnPage(page: Page, lastUrl: string): void;
  dispose(): Promise<void>;
};

async function createWarmPage(browser: Browser, url: string): Promise<Page> {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(120_000);
  page.setDefaultTimeout(120_000);
  await page.setViewport(VIEWPORT);
  await page.goto(url, GOTO_OPTIONS);
  await page.waitForSelector("img#booth-photo");
  return page;
}

export function createReceiptPageSlot(browser: Browser): ReceiptPageSlot {
  let cachedKey: string | undefined;
  let cachedPage: Page | undefined;
  let inflight: Promise<Page> | undefined;

  const closePage = (page: Page | undefined) => {
    if (page && !page.isClosed()) {
      page.close().catch(() => undefined);
    }
  };

  const prime = async (url: string): Promise<void> => {
    if (cachedKey === url && cachedPage && !cachedPage.isClosed()) {
      return;
    }

    if (inflight && cachedKey === url) {
      await inflight;
      return;
    }

    closePage(cachedPage);
    cachedPage = undefined;
    cachedKey = url;

    const promise = createWarmPage(browser, url);
    inflight = promise;

    try {
      cachedPage = await promise;
    } catch {
      cachedPage = undefined;
      cachedKey = undefined;
    } finally {
      inflight = undefined;
    }
  };

  const takeReadyPage = async (url: string): Promise<Page> => {
    if (inflight && cachedKey === url) {
      await inflight;
    }

    if (cachedKey === url && cachedPage && !cachedPage.isClosed()) {
      const page = cachedPage;
      cachedPage = undefined;
      cachedKey = undefined;
      return page;
    }

    const page = await createWarmPage(browser, url);
    return page;
  };

  const returnPage = (page: Page, lastUrl: string): void => {
    closePage(page);
    prime(lastUrl).catch(() => undefined);
  };

  const dispose = async (): Promise<void> => {
    closePage(cachedPage);
    cachedPage = undefined;
    cachedKey = undefined;
  };

  return { prime, takeReadyPage, returnPage, dispose };
}
