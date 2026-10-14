import type { Page } from "puppeteer";

import { withTimeout } from "@dither-booth/shared/async";
import { getErrorMessage } from "@dither-booth/shared/errors";
import { RECEIPT_VIEWER_PATH } from "@dither-booth/shared/routes";

import type { PuppeteerStartupState } from "#lib/puppeteer/puppeteer.types";

import type {
  PuppeteerRuntimeCheckHealthz,
  PuppeteerRuntimeCheckMap,
  PuppeteerRuntimeClientRouteDetails,
} from "./healthz.types";

import { DEPENDENCY_HEALTHZ_TIMEOUT_MS } from "./healthz.constants";
import {
  createHealthzError,
  createHealthyDependencyHealthz,
  createUnhealthyDependencyHealthz,
} from "./healthz.utils";

const CLIENT_ROUTE_STATUS_ATTRIBUTE = "data-dither-route-status";
const CLIENT_ROUTE_STATUS_SELECTOR = `[${CLIENT_ROUTE_STATUS_ATTRIBUTE}]`;
const CLIENT_ROUTE_STATUS_ERROR = "error";
const CLIENT_ROUTE_STATUS_NOT_FOUND = "not-found";
const CLIENT_ROUTE_STATUS_READY = "ready";
const CLIENT_ROUTE_STATUS_MISSING_MESSAGE =
  "Puppeteer page route status marker was not found.";

function getFailedCheckNames<const TChecks extends object>(
  checks: TChecks,
): Array<Extract<keyof TChecks, string>> {
  return Object.entries(checks)
    .filter(([, healthz]) => !(healthz as { ok: boolean }).ok)
    .map(([name]) => name as Extract<keyof TChecks, string>);
}

function createPuppeteerStageHealthz<
  const TStage extends PuppeteerStartupState[keyof PuppeteerStartupState],
>(stage: TStage) {
  if (stage.ok) {
    return createHealthyDependencyHealthz(
      stage.details ? { details: stage.details } : {},
    );
  }

  const message = stage.message ?? "Puppeteer startup stage failed.";

  return createUnhealthyDependencyHealthz({
    ...(stage.cause ? { cause: stage.cause } : {}),
    ...(stage.details
      ? { context: stage.details, details: stage.details }
      : {}),
    message,
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

  if (failedChecks.length > 0) {
    return createUnhealthyDependencyHealthz({
      context: {
        failedChecks,
      },
      details,
      message: "Puppeteer runtime is unhealthy.",
    });
  }

  return createHealthyDependencyHealthz({
    details,
  });
}

function getCurrentPathDetails(currentUrl: string) {
  try {
    return {
      currentPath: new URL(currentUrl).pathname,
    };
  } catch {
    return {};
  }
}

function createFailedPuppeteerRuntimeCheck<
  const TDetails extends object = Record<string, never>,
>({
  cause,
  context,
  details,
  message,
}: {
  cause?: string;
  context?: TDetails;
  details?: TDetails;
  message: string;
}): PuppeteerRuntimeCheckHealthz<TDetails> {
  return {
    ok: false,
    message,
    error: createHealthzError({
      ...(cause !== undefined ? { cause } : {}),
      ...(context !== undefined
        ? { context }
        : details !== undefined
          ? { context: details }
          : {}),
      message,
    }),
    ...(details !== undefined ? { details } : {}),
  };
}

function createClientRouteDetails({
  currentUrl,
  status,
  statuses,
}: {
  currentUrl: string;
  status?: "error" | "not-found" | "ready";
  statuses: string[];
}): PuppeteerRuntimeClientRouteDetails {
  return {
    ...getCurrentPathDetails(currentUrl),
    currentUrl,
    ...(status ? { status } : {}),
    statuses,
  };
}

export function createPuppeteerClientRouteHealthz({
  currentUrl,
  error,
  statuses = [],
}: {
  currentUrl: string;
  error?: unknown;
  statuses?: string[];
}): PuppeteerRuntimeCheckHealthz<PuppeteerRuntimeClientRouteDetails> {
  if (error) {
    const details = {
      ...getCurrentPathDetails(currentUrl),
      currentUrl,
      statuses,
    };
    const message = "Puppeteer page route status is unavailable.";

    return createFailedPuppeteerRuntimeCheck({
      cause: getErrorMessage(error),
      context: details,
      details,
      message,
    });
  }

  const statusSet = new Set(statuses);
  const status = statusSet.has(CLIENT_ROUTE_STATUS_NOT_FOUND)
    ? CLIENT_ROUTE_STATUS_NOT_FOUND
    : statusSet.has(CLIENT_ROUTE_STATUS_ERROR)
      ? CLIENT_ROUTE_STATUS_ERROR
      : statusSet.has(CLIENT_ROUTE_STATUS_READY)
        ? CLIENT_ROUTE_STATUS_READY
        : undefined;
  const details = createClientRouteDetails({
    currentUrl,
    status,
    statuses,
  });

  if (status === CLIENT_ROUTE_STATUS_NOT_FOUND) {
    const message = "Puppeteer page rendered the not found route.";

    return createFailedPuppeteerRuntimeCheck({
      details,
      message,
    });
  }

  if (status === CLIENT_ROUTE_STATUS_ERROR) {
    const message = "Puppeteer page rendered an error route.";

    return createFailedPuppeteerRuntimeCheck({
      details,
      message,
    });
  }

  if (statuses.length === 0) {
    const message = CLIENT_ROUTE_STATUS_MISSING_MESSAGE;

    return createFailedPuppeteerRuntimeCheck({
      details,
      message,
    });
  }

  if (
    status === CLIENT_ROUTE_STATUS_READY &&
    statuses.every((routeStatus) => routeStatus === CLIENT_ROUTE_STATUS_READY)
  ) {
    return {
      ok: true,
      details,
    };
  }

  const message = "Puppeteer page route status marker is invalid.";

  return createFailedPuppeteerRuntimeCheck({
    details,
    message,
  });
}

async function getClientRouteStatuses(page: Page) {
  await page
    .waitForSelector(CLIENT_ROUTE_STATUS_SELECTOR, {
      timeout: DEPENDENCY_HEALTHZ_TIMEOUT_MS,
    })
    .catch((error) => {
      throw new Error(CLIENT_ROUTE_STATUS_MISSING_MESSAGE, {
        cause: error,
      });
    });

  return await withTimeout({
    message: "Puppeteer page route status evaluation timed out.",
    promise: page.evaluate((attribute) => {
      const document = (
        globalThis as unknown as {
          document: {
            querySelectorAll: (selector: string) => Array<{
              getAttribute: (attribute: string) => string | null;
            }>;
          };
        }
      ).document;

      return Array.from(
        document.querySelectorAll(`[${attribute}]`),
        (element) => element.getAttribute(attribute),
      ).filter(
        (routeStatus): routeStatus is string =>
          typeof routeStatus === "string" && routeStatus.length > 0,
      );
    }, CLIENT_ROUTE_STATUS_ATTRIBUTE),
    timeoutMs: DEPENDENCY_HEALTHZ_TIMEOUT_MS,
  });
}

export async function checkPuppeteerRuntimeDependency(page: Page | undefined) {
  if (!page) {
    return createPuppeteerRuntimeHealthz({
      page: createFailedPuppeteerRuntimeCheck({
        message: "Puppeteer page is not initialized.",
      }),
      browser: createFailedPuppeteerRuntimeCheck({
        message: "Puppeteer browser is unavailable.",
      }),
      clientRoute: createFailedPuppeteerRuntimeCheck({
        message: "Puppeteer client route is unavailable.",
      }),
      document: createFailedPuppeteerRuntimeCheck({
        message: "Puppeteer document is unavailable.",
      }),
      url: createFailedPuppeteerRuntimeCheck({
        message: "Puppeteer page URL is unavailable.",
      }),
    });
  }

  if (page.isClosed()) {
    return createPuppeteerRuntimeHealthz({
      page: createFailedPuppeteerRuntimeCheck({
        message: "Puppeteer page is closed.",
      }),
      browser: createFailedPuppeteerRuntimeCheck({
        message: "Puppeteer browser is unavailable because the page is closed.",
      }),
      clientRoute: createFailedPuppeteerRuntimeCheck({
        message: "Puppeteer client route is unavailable.",
      }),
      document: createFailedPuppeteerRuntimeCheck({
        message:
          "Puppeteer document is unavailable because the page is closed.",
      }),
      url: createFailedPuppeteerRuntimeCheck({
        message:
          "Puppeteer page URL is unavailable because the page is closed.",
      }),
    });
  }

  const browser = page.browser();
  const checks: PuppeteerRuntimeCheckMap = {
    page: {
      ok: true,
    },
    browser: createFailedPuppeteerRuntimeCheck({
      message: "Puppeteer browser connection has not been checked.",
    }),
    clientRoute: createFailedPuppeteerRuntimeCheck({
      message: "Puppeteer client route has not been checked.",
    }),
    document: createFailedPuppeteerRuntimeCheck({
      message: "Puppeteer document has not been checked.",
    }),
    url: createFailedPuppeteerRuntimeCheck({
      message: "Puppeteer page URL has not been checked.",
    }),
  };

  if (!browser.connected) {
    return createPuppeteerRuntimeHealthz({
      ...checks,
      browser: createFailedPuppeteerRuntimeCheck({
        message: "Puppeteer browser is disconnected.",
      }),
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
        : createFailedPuppeteerRuntimeCheck({
            details: {
              currentPath,
              currentUrl,
              expectedPath: RECEIPT_VIEWER_PATH,
            },
            message: "Puppeteer page is not on the receipt viewer.",
          });
  } catch (error) {
    const details = {
      currentUrl,
      expectedPath: RECEIPT_VIEWER_PATH,
    };

    checks.url = createFailedPuppeteerRuntimeCheck({
      cause: getErrorMessage(error),
      context: details,
      details,
      message: "Puppeteer page URL is invalid.",
    });
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
        : createFailedPuppeteerRuntimeCheck({
            details: {
              expectedReadyState: "complete",
              readyState,
            },
            message: "Puppeteer page document is not fully loaded.",
          });
  } catch (error) {
    checks.document = createFailedPuppeteerRuntimeCheck({
      cause: getErrorMessage(error),
      message: "Puppeteer page is not responsive.",
    });
  }

  try {
    const statuses = await getClientRouteStatuses(page);

    checks.clientRoute = createPuppeteerClientRouteHealthz({
      currentUrl,
      statuses,
    });
  } catch (error) {
    checks.clientRoute = createPuppeteerClientRouteHealthz({
      currentUrl,
      ...(getErrorMessage(error) === CLIENT_ROUTE_STATUS_MISSING_MESSAGE
        ? { statuses: [] }
        : { error }),
    });
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
  const healthz =
    failedChecks.length > 0
      ? createUnhealthyDependencyHealthz({
          context: {
            failedChecks,
          },
          details: {
            failedChecks,
          },
          message: "Puppeteer dependency is unhealthy.",
        })
      : createHealthyDependencyHealthz();

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
