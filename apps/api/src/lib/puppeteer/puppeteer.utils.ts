import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { getWebOrigin } from "@dither-booth/ports";
import { getErrorMessage } from "@dither-booth/shared/errors";
import { RECEIPT_VIEWER_PATH } from "@dither-booth/shared/routes";
import puppeteer from "puppeteer";

import { API_BROWSER_LOG_SOURCE } from "#lib/browser/browser.constants";

import type {
  PuppeteerReceiptViewerNavigationDetails,
  PuppeteerReceiptViewer,
  PuppeteerStartupStage,
  PuppeteerStartupState,
} from "./puppeteer.types";

export function createReceiptViewerDetails(
  details: Omit<PuppeteerReceiptViewerNavigationDetails, "path"> = {},
): PuppeteerReceiptViewerNavigationDetails {
  return {
    path: RECEIPT_VIEWER_PATH,
    ...details,
  };
}

export function createSkippedPuppeteerStage<
  const TDetails extends object = Record<string, never>,
>({
  details,
  message,
}: {
  details?: TDetails;
  message: string;
}): PuppeteerStartupStage<TDetails> {
  return {
    ok: false,
    message,
    ...(details ? { details } : {}),
  };
}

export function createInitialPuppeteerState(): PuppeteerStartupState {
  return {
    launch: createSkippedPuppeteerStage({
      message: "Puppeteer browser launch has not run.",
    }),
    page: createSkippedPuppeteerStage({
      message: "Puppeteer page initialization has not run.",
    }),
    navigation: createSkippedPuppeteerStage({
      message: "Puppeteer receipt viewer navigation has not run.",
      details: createReceiptViewerDetails(),
    }),
  };
}

export function createFailedPuppeteerStage<
  const TDetails extends object = Record<string, never>,
>({
  details,
  error,
  message,
}: {
  details?: TDetails;
  error: unknown;
  message: string;
}): PuppeteerStartupStage<TDetails> {
  return {
    ok: false,
    cause: getErrorMessage(error),
    message,
    ...(details ? { details } : {}),
  };
}

export async function initializePuppeteerReceiptViewer({
  repoRoot,
}: {
  repoRoot: string;
}): Promise<PuppeteerReceiptViewer> {
  const state = createInitialPuppeteerState();
  let browser: PuppeteerReceiptViewer["browser"];
  let page: PuppeteerReceiptViewer["page"];

  try {
    browser = await puppeteer.launch({
      handleSIGHUP: false,
      handleSIGINT: false,
      handleSIGTERM: false,
    });
    state.launch = {
      ok: true,
    };
  } catch (error) {
    state.launch = createFailedPuppeteerStage({
      error,
      message: "Puppeteer browser failed to launch.",
    });
    state.page = createSkippedPuppeteerStage({
      message:
        "Puppeteer page initialization skipped because browser launch failed.",
    });
    state.navigation = createSkippedPuppeteerStage({
      message:
        "Puppeteer receipt viewer navigation skipped because browser launch failed.",
      details: createReceiptViewerDetails(),
    });
    logKioskEvent("error", API_BROWSER_LOG_SOURCE, "browser-launch-failed", {
      error: getKioskErrorDiagnostics(error, "Browser launch failed."),
    });
  }

  if (browser) {
    try {
      page = await browser.newPage();

      await page.setViewport({
        deviceScaleFactor: 2,
        width: 1440,
        height: 900,
      });

      state.page = {
        ok: true,
      };
    } catch (error) {
      state.page = createFailedPuppeteerStage({
        error,
        message: "Puppeteer page failed to initialize.",
      });
      state.navigation = createSkippedPuppeteerStage({
        message:
          "Puppeteer receipt viewer navigation skipped because page initialization failed.",
        details: createReceiptViewerDetails(),
      });
      logKioskEvent(
        "error",
        API_BROWSER_LOG_SOURCE,
        "browser-page-init-failed",
        {
          error: getKioskErrorDiagnostics(
            error,
            "Browser page initialization failed.",
          ),
        },
      );
    }
  }

  if (page && state.page.ok) {
    let receiptViewerUrl: string | undefined;

    try {
      const webOrigin = await getWebOrigin({ repoRoot });

      if (!webOrigin) {
        throw new Error("Web origin not found.");
      }

      receiptViewerUrl = new URL(RECEIPT_VIEWER_PATH, webOrigin).toString();
      await page.goto(receiptViewerUrl);

      state.navigation = {
        ok: true,
        details: createReceiptViewerDetails({
          url: receiptViewerUrl,
        }),
      };
    } catch (error) {
      const navigationDetails = createReceiptViewerDetails(
        receiptViewerUrl ? { url: receiptViewerUrl } : {},
      );

      state.navigation = createFailedPuppeteerStage({
        details: navigationDetails,
        error,
        message: "Puppeteer failed to navigate to receipt viewer.",
      });
      logKioskEvent(
        "error",
        API_BROWSER_LOG_SOURCE,
        "browser-navigation-failed",
        {
          details: navigationDetails,
          error: getKioskErrorDiagnostics(
            error,
            "Browser receipt viewer navigation failed.",
          ),
        },
      );
    }
  }

  return {
    browser,
    page,
    state,
  };
}
