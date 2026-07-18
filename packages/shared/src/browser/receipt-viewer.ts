import type {
  ReceiptTemplate,
  ReceiptViewerSearch,
} from "#isomorphic/routes";
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
  navigate: (options?: ReceiptViewerNavigationOptions) => Promise<void>;
};

export type ReceiptViewerRouteStateOptions = ReceiptViewerSearch & {
  receiptViewerPath?: string;
  templateAttribute?: string;
  templateSearchParam?: string;
};

type ReceiptViewerElement = {
  getAttribute: (attribute: string) => string | null;
};

type ReceiptViewerPageWindow = {
  __ditherReceiptViewer?: {
    navigate?: ReceiptViewerNavigationBridge["navigate"];
  };
  document: {
    querySelector: (selector: string) => ReceiptViewerElement | null;
  };
  location: {
    pathname: string;
    search: string;
  };
};

declare const window: ReceiptViewerPageWindow;

const LOTTERY_SEARCH_KEYS = [
  "outcome",
  "prizeId",
  "lotLabel",
  "lotRarity",
  "wonAt",
  "ticketRef",
] as const satisfies ReadonlyArray<keyof ReceiptViewerSearch>;

export function buildReceiptViewerSearch(
  options: ReceiptViewerSearch = {},
): ReceiptViewerSearch {
  const search: ReceiptViewerSearch = {};

  if (options.template) {
    search.template = options.template;
  }

  for (const key of LOTTERY_SEARCH_KEYS) {
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

function lotterySearchMatches(
  searchParams: URLSearchParams,
  options: ReceiptViewerSearch,
): boolean {
  for (const key of LOTTERY_SEARCH_KEYS) {
    const expected = options[key];
    const actual = searchParams.get(key);

    if (expected === undefined) {
      if (actual !== null) return false;
      continue;
    }

    if (actual !== expected) return false;
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

  if (!lotterySearchMatches(searchParams, options)) {
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

export type { ReceiptTemplate };
