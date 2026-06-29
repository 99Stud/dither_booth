import type { ReceiptTemplate } from "#isomorphic/routes";

export const RECEIPT_ELEMENT_ID = "receipt";
export const RECEIPT_ELEMENT_SELECTOR = `#${RECEIPT_ELEMENT_ID}`;
export const RECEIPT_VIEWER_TEMPLATE_ATTRIBUTE = "data-receipt-viewer-template";
export const RECEIPT_VIEWER_TEMPLATE_SELECTOR = `[${RECEIPT_VIEWER_TEMPLATE_ATTRIBUTE}]`;

export type ReceiptViewerNavigationOptions = {
  template?: ReceiptTemplate;
};

export type ReceiptViewerNavigationBridge = {
  navigate: (options?: ReceiptViewerNavigationOptions) => Promise<void>;
};

export type ReceiptViewerRouteStateOptions = {
  receiptViewerPath?: string;
  template?: ReceiptTemplate;
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

export function installReceiptViewerNavigationBridge(
  bridge: ReceiptViewerNavigationBridge,
): void {
  window.__ditherReceiptViewer = bridge;
}

export async function navigateReceiptViewerInPage(
  options: ReceiptViewerRouteStateOptions = {},
): Promise<void> {
  const receiptViewerPath = options.receiptViewerPath ?? "/receipt-viewer";
  const template = options.template;
  const receiptViewer = window.__ditherReceiptViewer;

  if (typeof receiptViewer?.navigate !== "function") {
    throw new Error("Receipt viewer navigation bridge is unavailable.");
  }

  await receiptViewer.navigate(template ? { template } : {});

  if (window.location.pathname !== receiptViewerPath) {
    throw new Error("Receipt viewer route did not match after navigation.");
  }
}

export function isReceiptViewerRouteStateCommittedInPage(
  options: ReceiptViewerRouteStateOptions = {},
): boolean {
  const { document, location } = window;
  const receiptViewerPath = options.receiptViewerPath ?? "/receipt-viewer";
  const template = options.template;
  const templateAttribute =
    options.templateAttribute ?? "data-receipt-viewer-template";
  const templateSearchParam = options.templateSearchParam ?? "template";

  if (location.pathname !== receiptViewerPath) {
    return false;
  }

  const searchParams = new URLSearchParams(location.search);
  const receiptViewerTemplate = document
    .querySelector(`[${templateAttribute}]`)
    ?.getAttribute(templateAttribute);

  if (template) {
    return (
      searchParams.get(templateSearchParam) === template &&
      receiptViewerTemplate === template
    );
  }

  return !searchParams.has(templateSearchParam) && receiptViewerTemplate === "";
}
