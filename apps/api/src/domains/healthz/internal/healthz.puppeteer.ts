import type { Page } from "puppeteer";

import type { PuppeteerStartupState } from "#lib/puppeteer/puppeteer.types";

import { RECEIPT_VIEWER_PATH } from "#lib/browser/browser.constants";
import { getErrorMessage, withTimeout } from "#lib/misc/misc.utils";

import type { PuppeteerRuntimeCheckMap } from "./healthz.types";

import { DEPENDENCY_HEALTHZ_TIMEOUT_MS } from "./healthz.constants";
import { createDependencyHealthz } from "./healthz.utils";

function getFailedCheckNames<const TChecks extends object>(
  checks: TChecks,
): Array<Extract<keyof TChecks, string>> {
  return Object.entries(checks)
    .filter(([, healthz]) => !(healthz as { ok: boolean }).ok)
    .map(([name]) => name as Extract<keyof TChecks, string>);
}

function createPuppeteerStageHealthz(
  stage: PuppeteerStartupState[keyof PuppeteerStartupState],
) {
  return createDependencyHealthz({
    ok: stage.ok,
    ...(stage.message ? { message: stage.message } : {}),
    ...(stage.details ? { details: stage.details } : {}),
  });
}

function createPuppeteerRuntimeHealthz<
  const TChecks extends PuppeteerRuntimeCheckMap,
>(checks: TChecks) {
  const failedChecks = getFailedCheckNames(checks);
  const details = {
    ...(failedChecks.length > 0 ? { failedChecks } : {}),
    ...checks,
  };

  return createDependencyHealthz(
    failedChecks.length > 0
      ? {
          ok: false,
          message: "Puppeteer runtime is unhealthy.",
          details,
        }
      : {
          ok: true,
          details,
        },
  );
}

export async function checkPuppeteerRuntimeDependency(page: Page | undefined) {
  if (!page) {
    return createPuppeteerRuntimeHealthz({
      page: {
        ok: false,
        message: "Puppeteer page is not initialized.",
      },
      browser: {
        ok: false,
      },
      document: {
        ok: false,
      },
      url: {
        ok: false,
      },
    });
  }

  if (page.isClosed()) {
    return createPuppeteerRuntimeHealthz({
      page: {
        ok: false,
        message: "Puppeteer page is closed.",
      },
      browser: {
        ok: false,
      },
      document: {
        ok: false,
      },
      url: {
        ok: false,
      },
    });
  }

  const browser = page.browser();
  const checks: PuppeteerRuntimeCheckMap = {
    page: {
      ok: true,
    },
    browser: {
      ok: false,
    },
    document: {
      ok: false,
    },
    url: {
      ok: false,
    },
  };

  if (!browser.connected) {
    return createPuppeteerRuntimeHealthz({
      ...checks,
      browser: {
        ok: false,
        message: "Puppeteer browser is disconnected.",
      },
    });
  }

  checks.browser = {
    ok: true,
  };

  const currentUrl = page.url();

  try {
    const currentPath = new URL(currentUrl).pathname;
    checks.url =
      currentPath === RECEIPT_VIEWER_PATH
        ? {
            ok: true,
            details: {
              currentPath,
              currentUrl,
              expectedPath: RECEIPT_VIEWER_PATH,
            },
          }
        : {
            ok: false,
            message: "Puppeteer page is not on the receipt viewer.",
            details: {
              currentPath,
              currentUrl,
              expectedPath: RECEIPT_VIEWER_PATH,
            },
          };
  } catch (error) {
    checks.url = {
      ok: false,
      message: "Puppeteer page URL is invalid.",
      details: {
        currentUrl,
        error: getErrorMessage(error),
        expectedPath: RECEIPT_VIEWER_PATH,
      },
    };
  }

  try {
    const readyState = await withTimeout({
      message: "Puppeteer page evaluation timed out.",
      promise: page.evaluate(
        () =>
          (globalThis as unknown as { document: { readyState: string } })
            .document.readyState,
      ),
      timeoutMs: DEPENDENCY_HEALTHZ_TIMEOUT_MS,
    });

    checks.document =
      readyState === "complete"
        ? {
            ok: true,
            details: {
              readyState,
            },
          }
        : {
            ok: false,
            message: "Puppeteer page document is not fully loaded.",
            details: {
              expectedReadyState: "complete",
              readyState,
            },
          };
  } catch (error) {
    checks.document = {
      ok: false,
      message: "Puppeteer page is not responsive.",
      details: {
        error: getErrorMessage(error),
      },
    };
  }

  return createPuppeteerRuntimeHealthz(checks);
}

export async function checkPuppeteerDependency({
  page,
  state,
}: {
  page: Page | undefined;
  state: PuppeteerStartupState;
}) {
  const launch = createPuppeteerStageHealthz(state.launch);
  const pageHealthz = createPuppeteerStageHealthz(state.page);
  const navigation = createPuppeteerStageHealthz(state.navigation);
  const runtime = await checkPuppeteerRuntimeDependency(page);
  const checks = {
    launch,
    page: pageHealthz,
    navigation,
    runtime,
  };
  const failedChecks = getFailedCheckNames(checks);
  const healthzPayload =
    failedChecks.length > 0
      ? {
          ok: false,
          message: "Puppeteer dependency is unhealthy.",
          details: {
            failedChecks,
          },
        }
      : {
          ok: true,
        };

  const healthz = createDependencyHealthz(healthzPayload);

  return {
    healthz,
    launch,
    page: pageHealthz,
    navigation,
    runtime,
  };
}

export type PuppeteerRuntimeDependencyHealthz = Awaited<
  ReturnType<typeof checkPuppeteerRuntimeDependency>
>;

export type PuppeteerHealthz = Awaited<
  ReturnType<typeof checkPuppeteerDependency>
>;
