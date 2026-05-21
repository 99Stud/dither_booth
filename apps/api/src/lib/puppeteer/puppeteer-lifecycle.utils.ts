import type { Browser } from "puppeteer";

import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";

import { API_BROWSER_LOG_SOURCE } from "#lib/browser/browser.constants";

import type {
  PuppeteerReceiptViewer,
  PuppeteerReceiptViewerLifecycle,
  PuppeteerReceiptViewerRestartResult,
} from "./puppeteer.types";

import {
  createInitialPuppeteerState,
  initializePuppeteerReceiptViewer,
} from "./puppeteer.utils";

const PUPPETEER_BROWSER_CLOSE_TIMEOUT_MS = 5_000;
const PUPPETEER_BROWSER_KILL_TIMEOUT_MS = 5_000;

type BrowserProcess = NonNullable<ReturnType<Browser["process"]>>;

function createRestartResult(
  receiptViewer: PuppeteerReceiptViewer,
): PuppeteerReceiptViewerRestartResult {
  return {
    ok:
      receiptViewer.state.launch.ok &&
      receiptViewer.state.page.ok &&
      receiptViewer.state.navigation.ok,
    state: receiptViewer.state,
  };
}

async function withTimeout<T>({
  message,
  promise,
  timeoutMs,
}: {
  message: string;
  promise: Promise<T>;
  timeoutMs: number;
}): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function waitForProcessExit({
  browserProcess,
  timeoutMs,
}: {
  browserProcess: BrowserProcess;
  timeoutMs: number;
}) {
  return withTimeout({
    message: "Timed out waiting for Puppeteer browser process to exit.",
    promise: new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        browserProcess.removeListener("close", onClose);
        browserProcess.removeListener("error", onError);
        browserProcess.removeListener("exit", onExit);
      };
      const resolveOnce = () => {
        cleanup();
        resolve();
      };
      const rejectOnce = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onClose = () => {
        resolveOnce();
      };
      const onError = (error: Error) => {
        rejectOnce(error);
      };
      const onExit = () => {
        resolveOnce();
      };

      if (
        browserProcess.exitCode !== null ||
        browserProcess.signalCode !== null
      ) {
        resolve();
        return;
      }

      browserProcess.once("close", onClose);
      browserProcess.once("error", onError);
      browserProcess.once("exit", onExit);
    }),
    timeoutMs,
  });
}

async function killBrowserProcess(browserProcess: BrowserProcess) {
  if (browserProcess.exitCode !== null || browserProcess.signalCode !== null) {
    return;
  }

  browserProcess.kill("SIGKILL");

  await waitForProcessExit({
    browserProcess,
    timeoutMs: PUPPETEER_BROWSER_KILL_TIMEOUT_MS,
  });
}

async function terminatePuppeteerReceiptViewer(
  receiptViewer: PuppeteerReceiptViewer,
) {
  const { browser } = receiptViewer;

  if (!browser) {
    return;
  }

  const browserProcess = browser.process();

  try {
    await withTimeout({
      message: "Timed out closing Puppeteer browser.",
      promise: browser.close(),
      timeoutMs: PUPPETEER_BROWSER_CLOSE_TIMEOUT_MS,
    });
  } catch (error) {
    if (!browserProcess) {
      throw error;
    }

    logKioskEvent("error", API_BROWSER_LOG_SOURCE, "browser-close-failed", {
      error: getKioskErrorDiagnostics(error, "Puppeteer browser close failed."),
    });

    await killBrowserProcess(browserProcess);
  }
}

export function createPuppeteerReceiptViewerLifecycle({
  repoRoot,
}: {
  repoRoot: string;
}): PuppeteerReceiptViewerLifecycle {
  let current: PuppeteerReceiptViewer = {
    state: createInitialPuppeteerState(),
  };
  let restartPromise: Promise<PuppeteerReceiptViewerRestartResult> | undefined;

  const initialize = async () => {
    current = await initializePuppeteerReceiptViewer({ repoRoot });

    return current;
  };

  const restart = () => {
    restartPromise ??= (async () => {
      const previous = current;

      current = {
        state: createInitialPuppeteerState(),
      };

      await terminatePuppeteerReceiptViewer(previous);

      const next = await initializePuppeteerReceiptViewer({ repoRoot });
      current = next;

      return createRestartResult(next);
    })().finally(() => {
      restartPromise = undefined;
    });

    return restartPromise;
  };

  const close = async () => {
    if (restartPromise) {
      await restartPromise;
    }

    const previous = current;
    current = {
      state: createInitialPuppeteerState(),
    };

    await terminatePuppeteerReceiptViewer(previous);
  };

  return {
    close,
    getCurrent: () => current,
    initialize,
    restart,
  };
}
