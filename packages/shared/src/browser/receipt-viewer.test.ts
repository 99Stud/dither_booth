import { describe, expect, test } from "bun:test";

import {
  RECEIPT_VIEWER_PATH,
  RECEIPT_VIEWER_TEMPLATE_SEARCH_PARAM,
} from "#isomorphic/routes";

import {
  installReceiptViewerNavigationBridge,
  isReceiptViewerRouteStateCommittedInPage,
  isReceiptViewerRouteStateCommittedViaBridgeInPage,
  navigateReceiptViewerInPage,
  navigateReceiptViewerViaBridgeInPage,
  type ReceiptViewerNavigationBridge,
} from "./receipt-viewer";

type FakeReceiptViewerWindow = {
  __ditherReceiptViewer?: ReceiptViewerNavigationBridge;
  document: {
    querySelector: (selector: string) => {
      getAttribute: (attribute: string) => string | null;
    } | null;
  };
  location: {
    pathname: string;
    search: string;
  };
};

function createFakeReceiptViewerWindow({
  pathname = RECEIPT_VIEWER_PATH,
  search = "",
  templateAttribute = "",
}: {
  pathname?: string;
  search?: string;
  templateAttribute?: string | null;
} = {}): FakeReceiptViewerWindow {
  return {
    document: {
      querySelector: () => ({
        getAttribute: () => templateAttribute,
      }),
    },
    location: {
      pathname,
      search,
    },
  };
}

async function withFakeReceiptViewerWindow<T>(
  fakeWindow: FakeReceiptViewerWindow,
  run: () => Promise<T> | T,
): Promise<T> {
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "window",
  );

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow,
    writable: true,
  });

  try {
    return await run();
  } finally {
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
}

describe("receipt viewer page helpers", () => {
  test("installs and uses the receipt viewer navigation bridge", async () => {
    const events: string[] = [];
    const fakeWindow = createFakeReceiptViewerWindow();

    await withFakeReceiptViewerWindow(fakeWindow, async () => {
      installReceiptViewerNavigationBridge({
        isRouteStateCommitted: () => true,
        navigate: async ({ template } = {}) => {
          events.push(`navigate:${template ?? "root"}`);
        },
      });

      await navigateReceiptViewerInPage({ template: "photo" });
    });

    expect(events).toEqual(["navigate:photo"]);
  });

  test("puppeteer-safe bridge helpers call into the installed bridge", async () => {
    const events: string[] = [];
    const fakeWindow = createFakeReceiptViewerWindow({
      search: `?${RECEIPT_VIEWER_TEMPLATE_SEARCH_PARAM}=photo`,
      templateAttribute: "photo",
    });

    await withFakeReceiptViewerWindow(fakeWindow, async () => {
      installReceiptViewerNavigationBridge({
        isRouteStateCommitted: (options = {}) => {
          events.push(`committed:${options.template ?? "root"}`);
          return options.template === "photo";
        },
        navigate: async ({ template } = {}) => {
          events.push(`navigate:${template ?? "root"}`);
        },
      });

      await navigateReceiptViewerViaBridgeInPage({ template: "photo" });
      expect(
        isReceiptViewerRouteStateCommittedViaBridgeInPage({
          template: "photo",
        }),
      ).toBe(true);
    });

    expect(events).toEqual(["navigate:photo", "committed:photo"]);
  });

  test("requires selected template URL and DOM state to match", async () => {
    const fakeWindow = createFakeReceiptViewerWindow({
      search: `?${RECEIPT_VIEWER_TEMPLATE_SEARCH_PARAM}=photo`,
      templateAttribute: "photo",
    });

    await withFakeReceiptViewerWindow(fakeWindow, () => {
      expect(
        isReceiptViewerRouteStateCommittedInPage({ template: "photo" }),
      ).toBe(true);
    });
  });

  test("requires reset URL and DOM state to match", async () => {
    const fakeWindow = createFakeReceiptViewerWindow({
      search: "",
      templateAttribute: "",
    });

    await withFakeReceiptViewerWindow(fakeWindow, () => {
      expect(isReceiptViewerRouteStateCommittedInPage()).toBe(true);
    });
  });

  test("matches ticket item names encoded in the search string", async () => {
    const ticketItems = ["Mate", "Ginette"];
    const fakeWindow = createFakeReceiptViewerWindow({
      search: `?${RECEIPT_VIEWER_TEMPLATE_SEARCH_PARAM}=photo&ticketItems=${encodeURIComponent(JSON.stringify(ticketItems))}`,
      templateAttribute: "photo",
    });

    await withFakeReceiptViewerWindow(fakeWindow, () => {
      expect(
        isReceiptViewerRouteStateCommittedInPage({
          template: "photo",
          ticketItems,
        }),
      ).toBe(true);
      expect(isReceiptViewerRouteStateCommittedInPage()).toBe(false);
    });
  });

  test("requires the kit in the URL to match", async () => {
    const fakeWindow = createFakeReceiptViewerWindow({
      search: `?${RECEIPT_VIEWER_TEMPLATE_SEARCH_PARAM}=photo&kit=tartines`,
      templateAttribute: "photo",
    });

    await withFakeReceiptViewerWindow(fakeWindow, () => {
      expect(
        isReceiptViewerRouteStateCommittedInPage({
          template: "photo",
          kit: "tartines",
        }),
      ).toBe(true);
      expect(
        isReceiptViewerRouteStateCommittedInPage({ template: "photo" }),
      ).toBe(false);
    });
  });

  test("rejects URL-only match when DOM still has a stale template", async () => {
    const staleTemplateWindow = createFakeReceiptViewerWindow({
      search: `?${RECEIPT_VIEWER_TEMPLATE_SEARCH_PARAM}=photo`,
      templateAttribute: "lottery",
    });

    await withFakeReceiptViewerWindow(staleTemplateWindow, () => {
      expect(
        isReceiptViewerRouteStateCommittedInPage({ template: "photo" }),
      ).toBe(false);
    });

    const staleResetWindow = createFakeReceiptViewerWindow({
      search: "",
      templateAttribute: "photo",
    });

    await withFakeReceiptViewerWindow(staleResetWindow, () => {
      expect(isReceiptViewerRouteStateCommittedInPage()).toBe(false);
    });
  });
});
