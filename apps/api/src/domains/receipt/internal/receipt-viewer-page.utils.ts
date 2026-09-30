import type { ElementHandle, Page } from "puppeteer";

import { withTimeout } from "@dither-booth/shared/async";
import {
  RECEIPT_ELEMENT_SELECTOR,
  RECEIPT_VIEWER_TEMPLATE_ATTRIBUTE,
  isReceiptViewerRouteStateCommittedInPage,
  navigateReceiptViewerInPage,
  type ReceiptViewerRouteStateOptions,
} from "@dither-booth/shared/browser/receipt-viewer";
import {
  RECEIPT_VIEWER_PATH,
  RECEIPT_VIEWER_TEMPLATE_SEARCH_PARAM,
  type ReceiptTemplate,
} from "@dither-booth/shared/routes";
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

const RECEIPT_VIEWER_NAVIGATION_TIMEOUT_MS = 3_000;

function createReceiptViewerPageNavigationOptions(
  template?: ReceiptTemplate,
): ReceiptViewerRouteStateOptions {
  return {
    receiptViewerPath: RECEIPT_VIEWER_PATH,
    template,
    templateAttribute: RECEIPT_VIEWER_TEMPLATE_ATTRIBUTE,
    templateSearchParam: RECEIPT_VIEWER_TEMPLATE_SEARCH_PARAM,
  };
}

type ReceiptViewerNavigationPage = Pick<Page, "evaluate" | "waitForFunction">;

export async function navigateReceiptViewerClientSide({
  page,
  template,
}: {
  page: ReceiptViewerNavigationPage;
  template?: ReceiptTemplate;
}): Promise<void> {
  const navigationOptions = createReceiptViewerPageNavigationOptions(template);
  const errorMessage = template
    ? "Failed to select receipt viewer template."
    : "Failed to reset receipt viewer route.";

  try {
    await page.evaluate(navigateReceiptViewerInPage, navigationOptions);

    await page.waitForFunction(
      isReceiptViewerRouteStateCommittedInPage,
      { timeout: RECEIPT_VIEWER_NAVIGATION_TIMEOUT_MS },
      navigationOptions,
    );
  } catch (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: errorMessage,
      cause: error,
    });
  }
}

export async function withReceiptViewerTemplate<T>({
  page,
  run,
  template,
}: {
  page: ReceiptViewerNavigationPage;
  run: () => Promise<T>;
  template: ReceiptTemplate;
}): Promise<T> {
  const actionResult = await attempt(async () => {
    await navigateReceiptViewerClientSide({ page, template });

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

export async function captureReceiptScreenshot({
  image,
  page,
  template,
}: {
  image: ReceiptImageData;
  page: ReceiptScreenshotPage;
  template: ReceiptTemplate;
}): Promise<Uint8Array> {
  return await withReceiptViewerTemplate({
    page,
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
    },
    template,
  });
}
