import type {
  PhotoReceiptTemplate,
  ReceiptViewerSearch,
} from "@dither-booth/shared/routes";
import type { ElementHandle, Page } from "puppeteer";

import { withTimeout } from "@dither-booth/shared/async";
import {
  RECEIPT_ELEMENT_SELECTOR,
  RECEIPT_TICKET_READY_SELECTOR,
  isReceiptViewerRouteStateCommittedViaBridgeInPage,
  navigateReceiptViewerViaBridgeInPage,
} from "@dither-booth/shared/browser/receipt-viewer";
import { TRPCError } from "@trpc/server";

type AttemptResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      error: unknown;
      ok: false;
    };

async function attempt<T>(run: () => Promise<T>): Promise<AttemptResult<T>> {
  try {
    return {
      ok: true,
      value: await run(),
    };
  } catch (error) {
    return {
      error,
      ok: false,
    };
  }
}

let receiptViewerPageJobQueue: Promise<void> = Promise.resolve();

/**
 * Serializes work against the shared receipt viewer page.
 *
 * `timeoutMs` bounds how long the *caller* waits, not the job itself: puppeteer
 * work cannot be cancelled, so a timed-out job keeps running — and still resets
 * the page to its root route when it finishes. The queue slot is therefore held
 * until the job actually settles, so an orphan can never steer the shared page
 * out from under whichever job picked up the slot next.
 */
export async function runExclusiveReceiptViewerPageJob<T>(
  job: () => Promise<T>,
  options: { timeoutMessage?: string; timeoutMs?: number } = {},
): Promise<T> {
  const previousJob = receiptViewerPageJobQueue;
  let releaseCurrentJob: () => void = () => {};

  receiptViewerPageJobQueue = new Promise<void>((resolve) => {
    releaseCurrentJob = resolve;
  });

  await previousJob;

  // The async wrapper turns a synchronous throw from `job` into a rejection, so
  // the slot is always released exactly once.
  const jobPromise = (async () => await job())();

  // The slot follows the real work, not the caller. On timeout the caller below
  // rejects immediately while this keeps the slot held until the orphaned page
  // work settles. Also doubles as the rejection handler for a discarded job — do
  // not simplify to `.finally`, which re-throws and would leave the rejection of
  // a discarded job unhandled.
  //
  // The handlers must swallow their argument: `releaseCurrentJob` is a
  // `Promise<void>` resolve typed as `() => void`, so passing it directly would
  // hand it the job's value and a thenable `T` would make the queue adopt it
  // instead of releasing the slot.
  void jobPromise.then(
    () => {
      releaseCurrentJob();
    },
    () => {
      releaseCurrentJob();
    },
  );

  if (options.timeoutMs === undefined) {
    return await jobPromise;
  }

  return await withTimeout({
    message: options.timeoutMessage ?? "Receipt viewer page job timed out.",
    promise: jobPromise,
    timeoutMs: options.timeoutMs,
  });
}

const RECEIPT_VIEWER_NAVIGATION_TIMEOUT_MS = 10_000;
const RECEIPT_TICKET_READY_TIMEOUT_MS = 3_000;

type ReceiptViewerNavigationPage = Pick<Page, "evaluate" | "waitForFunction">;

async function readReceiptViewerNavigationDiagnostics(
  page: ReceiptViewerNavigationPage,
  search: ReceiptViewerSearch,
) {
  try {
    return await page.evaluate((expected) => {
      const runtime = globalThis as typeof globalThis & {
        document?: {
          querySelector: (selector: string) => {
            getAttribute: (name: string) => string | null;
          } | null;
        };
        location?: { href?: string; pathname?: string; search?: string };
        __ditherReceiptViewer?: {
          isRouteStateCommitted?: (options?: unknown) => boolean;
        };
      };

      return {
        href: runtime.location?.href,
        pathname: runtime.location?.pathname,
        search: runtime.location?.search,
        templateAttribute: runtime.document
          ?.querySelector("[data-receipt-viewer-template]")
          ?.getAttribute("data-receipt-viewer-template"),
        hasBridge:
          typeof runtime.__ditherReceiptViewer?.isRouteStateCommitted ===
          "function",
        committed:
          runtime.__ditherReceiptViewer?.isRouteStateCommitted?.(expected) ??
          false,
        expected,
      };
    }, search);
  } catch (error) {
    return {
      diagnosticError:
        error instanceof Error ? error.message : "Failed to read diagnostics.",
    };
  }
}

export async function navigateReceiptViewerClientSide({
  page,
  search = {},
}: {
  page: ReceiptViewerNavigationPage;
  search?: ReceiptViewerSearch;
}): Promise<void> {
  const errorMessage = search.template
    ? "Failed to select receipt viewer template."
    : "Failed to reset receipt viewer route.";

  try {
    // Use bridge-only helpers — Puppeteer cannot serialize module closures.
    await page.evaluate(navigateReceiptViewerViaBridgeInPage, search);

    await page.waitForFunction(
      isReceiptViewerRouteStateCommittedViaBridgeInPage,
      { timeout: RECEIPT_VIEWER_NAVIGATION_TIMEOUT_MS },
      search,
    );
  } catch (error) {
    const diagnostics = await readReceiptViewerNavigationDiagnostics(
      page,
      search,
    );

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: errorMessage,
      cause: {
        error,
        diagnostics,
      },
    });
  }
}

export async function withReceiptViewerSearch<T>({
  page,
  run,
  search,
}: {
  page: ReceiptViewerNavigationPage;
  run: () => Promise<T>;
  search: ReceiptViewerSearch;
}): Promise<T> {
  const actionResult = await attempt(async () => {
    await navigateReceiptViewerClientSide({ page, search });

    return await run();
  });
  const resetResult = await attempt(async () => {
    await navigateReceiptViewerClientSide({ page });
  });

  if (!actionResult.ok) {
    throw actionResult.error;
  }

  if (!resetResult.ok) {
    throw resetResult.error;
  }

  return actionResult.value;
}

const RECEIPT_PHOTO_ELEMENT_SELECTOR = "img#booth-photo";
const RECEIPT_PHOTO_ELEMENT_TIMEOUT_MS = 3_000;

type ReceiptScreenshotPage = ReceiptViewerNavigationPage &
  Pick<Page, "locator">;

type ReceiptImageData = {
  data: string;
  mimeType: string;
};

async function screenshotReceiptElement(
  page: ReceiptScreenshotPage,
): Promise<Uint8Array> {
  const receiptHandle: ElementHandle = await page
    .locator(RECEIPT_ELEMENT_SELECTOR)
    .waitHandle()
    .catch((error) => {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Receipt element was not found.",
        cause: error,
      });
    });

  return await receiptHandle
    .screenshot({
      optimizeForSpeed: true,
    })
    .catch((error) => {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to screenshot receipt element.",
        cause: error,
      });
    });
}

export async function captureReceiptScreenshot({
  image,
  page,
  template,
  ticketRef,
}: {
  image: ReceiptImageData;
  page: ReceiptScreenshotPage;
  template: PhotoReceiptTemplate;
  ticketRef?: string;
}): Promise<Uint8Array> {
  return await withReceiptViewerSearch({
    page,
    search: { template, ...(ticketRef ? { ticketRef } : {}) },
    run: async () => {
      const imageHandle: ElementHandle = await page
        .locator(RECEIPT_PHOTO_ELEMENT_SELECTOR)
        .setTimeout(RECEIPT_PHOTO_ELEMENT_TIMEOUT_MS)
        .waitHandle()
        .catch((error) => {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Receipt photo element was not found.",
            cause: error,
          });
        });

      await imageHandle.evaluate(
        async (element: unknown, nextImage: ReceiptImageData) => {
          // INFO: do not extract this function, puppeteer needs this to be created on runtime
          const isImageElement = (
            element: unknown,
          ): element is {
            src: string;
            decode: () => Promise<undefined>;
          } => {
            return (
              element !== null &&
              typeof element === "object" &&
              "src" in element &&
              typeof element.src === "string" &&
              "decode" in element &&
              typeof element.decode === "function"
            );
          };

          if (!isImageElement(element)) {
            throw new Error("Receipt photo element is not an image.");
          }

          element.src = `data:${nextImage.mimeType};base64,${nextImage.data}`;
          await element.decode();
        },
        image,
      );

      return await screenshotReceiptElement(page);
    },
  });
}

export async function captureLotteryTicketScreenshot({
  page,
  search,
}: {
  page: ReceiptScreenshotPage;
  search: ReceiptViewerSearch & { template: "lottery" };
}): Promise<Uint8Array> {
  return await withReceiptViewerSearch({
    page,
    search,
    run: async () => {
      await page
        .locator(RECEIPT_TICKET_READY_SELECTOR)
        .setTimeout(RECEIPT_TICKET_READY_TIMEOUT_MS)
        .waitHandle()
        .catch((error) => {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Lottery ticket was not ready.",
            cause: error,
          });
        });

      return await screenshotReceiptElement(page);
    },
  });
}
