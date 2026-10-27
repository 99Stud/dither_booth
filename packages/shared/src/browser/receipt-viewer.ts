import type { ReceiptTemplate, ReceiptViewerSearch } from "#isomorphic/routes";

import {
  RECEIPT_VIEWER_PATH,
  RECEIPT_VIEWER_TEMPLATE_SEARCH_PARAM,
} from "#isomorphic/routes";

export const RECEIPT_ELEMENT_ID = "receipt";
export const RECEIPT_ELEMENT_SELECTOR = `#${RECEIPT_ELEMENT_ID}`;
export const RECEIPT_TICKET_READY_ATTRIBUTE = "data-ticket-ready";
export const RECEIPT_TICKET_READY_SELECTOR = `${RECEIPT_ELEMENT_SELECTOR}[${RECEIPT_TICKET_READY_ATTRIBUTE}="true"]`;
export const RECEIPT_VIEWER_TEMPLATE_ATTRIBUTE = "data-receipt-viewer-template";
export const RECEIPT_VIEWER_TEMPLATE_SELECTOR = `[${RECEIPT_VIEWER_TEMPLATE_ATTRIBUTE}]`;

export type ReceiptViewerNavigationOptions = ReceiptViewerSearch;

export type ReceiptViewerNavigationBridge = {
  isRouteStateCommitted: (options?: ReceiptViewerNavigationOptions) => boolean;
  navigate: (options?: ReceiptViewerNavigationOptions) => Promise<void>;
};

export type ReceiptViewerRouteStateOptions = ReceiptViewerSearch & {
  receiptViewerPath?: string;
  templateAttribute?: string;
  templateSearchParam?: string;
};

type ReceiptViewerElement = {
  getAttribute: (attribute: string) => string | null;
  /** Set on `<img>` elements. */
  tagName?: string;
  complete?: boolean;
  addEventListener?: (
    type: "load" | "error",
    listener: () => void,
    options: { once: true },
  ) => void;
};

type ReceiptViewerImage = {
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
};

type ReceiptViewerPageWindow = {
  __ditherReceiptViewer?: ReceiptViewerNavigationBridge;
  document: {
    querySelector: (selector: string) => ReceiptViewerElement | null;
    querySelectorAll: (selector: string) => Iterable<ReceiptViewerElement>;
  };
  getComputedStyle: (element: ReceiptViewerElement) => {
    backgroundImage: string;
    maskImage: string;
  };
  Image: new () => ReceiptViewerImage;
  location: {
    pathname: string;
    search: string;
  };
};

declare const window: ReceiptViewerPageWindow;

export const RECEIPT_VIEWER_SEARCH_KEYS = [
  "template",
  "kit",
  "outcome",
  "prizeId",
  "title",
  "winInstruction",
  "prizeRarity",
  "wonAt",
  "ticketRef",
  "ticketItems",
] as const satisfies ReadonlyArray<keyof ReceiptViewerSearch>;

const URL_SEARCH_KEYS = [
  "kit",
  "outcome",
  "prizeId",
  "title",
  "winInstruction",
  "prizeRarity",
  "wonAt",
  "ticketRef",
  "ticketItems",
] as const satisfies ReadonlyArray<keyof ReceiptViewerSearch>;

export function receiptSearchValuesMatch(
  actual: unknown,
  expected: unknown,
): boolean {
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(actual) || !Array.isArray(expected)) {
      return false;
    }
    if (actual.length !== expected.length) {
      return false;
    }
    return actual.every((value, index) => value === expected[index]);
  }

  return actual === expected;
}

export function buildReceiptViewerSearch(
  options: ReceiptViewerSearch = {},
): ReceiptViewerSearch {
  const search: ReceiptViewerSearch = {};

  if (options.template) {
    search.template = options.template;
  }

  for (const key of URL_SEARCH_KEYS) {
    const value = options[key];
    if (value !== undefined) {
      search[key] = value as never;
    }
  }

  return search;
}

export function installReceiptViewerNavigationBridge(
  bridge: ReceiptViewerNavigationBridge,
): void {
  window.__ditherReceiptViewer = bridge;
}

export async function navigateReceiptViewerInPage(
  options: ReceiptViewerRouteStateOptions = {},
): Promise<void> {
  const receiptViewerPath = options.receiptViewerPath ?? RECEIPT_VIEWER_PATH;
  const receiptViewer = window.__ditherReceiptViewer;

  if (typeof receiptViewer?.navigate !== "function") {
    throw new Error("Receipt viewer navigation bridge is unavailable.");
  }

  const search = buildReceiptViewerSearch(options);
  await receiptViewer.navigate(search);

  if (window.location.pathname !== receiptViewerPath) {
    throw new Error("Receipt viewer route did not match after navigation.");
  }
}

function urlReceiptSearchValueMatches(
  actual: string | null,
  expected: ReceiptViewerSearch[keyof ReceiptViewerSearch],
): boolean {
  if (expected === undefined) {
    return actual === null;
  }

  if (Array.isArray(expected)) {
    if (actual === null) {
      return false;
    }

    try {
      return receiptSearchValuesMatch(JSON.parse(actual), expected);
    } catch {
      return false;
    }
  }

  return actual === expected;
}

function urlSearchMatches(
  searchParams: URLSearchParams,
  options: ReceiptViewerSearch,
): boolean {
  for (const key of URL_SEARCH_KEYS) {
    if (!urlReceiptSearchValueMatches(searchParams.get(key), options[key])) {
      return false;
    }
  }

  return true;
}

export function isReceiptViewerRouteStateCommittedInPage(
  options: ReceiptViewerRouteStateOptions = {},
): boolean {
  const { document, location } = window;
  const receiptViewerPath = options.receiptViewerPath ?? RECEIPT_VIEWER_PATH;
  const template = options.template;
  const templateAttribute =
    options.templateAttribute ?? "data-receipt-viewer-template";
  const templateSearchParam =
    options.templateSearchParam ?? RECEIPT_VIEWER_TEMPLATE_SEARCH_PARAM;

  if (location.pathname !== receiptViewerPath) {
    return false;
  }

  const searchParams = new URLSearchParams(location.search);
  const receiptViewerTemplate = document
    .querySelector(`[${templateAttribute}]`)
    ?.getAttribute(templateAttribute);

  if (!urlSearchMatches(searchParams, options)) {
    return false;
  }

  if (template) {
    return (
      searchParams.get(templateSearchParam) === template &&
      receiptViewerTemplate === template
    );
  }

  return !searchParams.has(templateSearchParam) && receiptViewerTemplate === "";
}

/**
 * Puppeteer-safe: only touches `window` + the options arg (no module closures).
 * Call this from page.evaluate / waitForFunction.
 */
export async function navigateReceiptViewerViaBridgeInPage(
  options: ReceiptViewerSearch = {},
): Promise<void> {
  const receiptViewer = window.__ditherReceiptViewer;

  if (typeof receiptViewer?.navigate !== "function") {
    throw new Error("Receipt viewer navigation bridge is unavailable.");
  }

  await receiptViewer.navigate(options);

  if (window.location.pathname !== "/receipt-viewer") {
    throw new Error("Receipt viewer route did not match after navigation.");
  }
}

/**
 * Puppeteer-safe: only touches `window` + the options arg (no module closures).
 * Call this from page.waitForFunction.
 */
export function isReceiptViewerRouteStateCommittedViaBridgeInPage(
  options: ReceiptViewerSearch = {},
): boolean {
  const receiptViewer = window.__ditherReceiptViewer;

  if (typeof receiptViewer?.isRouteStateCommitted !== "function") {
    return false;
  }

  return receiptViewer.isRouteStateCommitted(options);
}

/**
 * Puppeteer-safe: only touches `window` + the selector arg (no module
 * closures). Resolves once every image on the ticket has loaded or failed:
 * each `<img>`, such as a partner logo, and each CSS image (mask,
 * background). A screenshot waits for the photo it sets, not for these, and
 * they are fetched when the ticket first renders. Returns the sources that
 * failed, so the ticket still prints and the caller can log them. Waits on
 * `load`, not `decode()`: decode can stay pending while the page isn't
 * painting.
 */
export async function loadReceiptImagesInPage(
  receiptSelector: string,
): Promise<string[]> {
  const urls = new Set<string>();
  // Each resolves to the image's source when it failed, or null once loaded.
  const pendingImages: Promise<string | null>[] = [];
  const elements = window.document.querySelectorAll(
    `${receiptSelector}, ${receiptSelector} *`,
  );

  for (const element of elements) {
    if (element.tagName === "IMG" && element.complete === false) {
      pendingImages.push(
        new Promise<string | null>((resolve) => {
          element.addEventListener?.("load", () => resolve(null), {
            once: true,
          });
          element.addEventListener?.(
            "error",
            () => resolve(element.getAttribute("src") ?? "<img>"),
            { once: true },
          );
        }),
      );
    }

    const style = window.getComputedStyle(element);

    for (const value of [style.maskImage, style.backgroundImage]) {
      for (const match of value.matchAll(/url\("?([^")]+)"?\)/gu)) {
        if (match[1]) {
          urls.add(match[1]);
        }
      }
    }
  }

  const results = await Promise.all([
    ...pendingImages,
    ...[...urls].map(
      (url) =>
        new Promise<string | null>((resolve) => {
          const image = new window.Image();
          image.onload = () => resolve(null);
          image.onerror = () => resolve(url);
          image.src = url;
        }),
    ),
  ]);

  return results.filter((url): url is string => url !== null);
}

export type { ReceiptTemplate };
