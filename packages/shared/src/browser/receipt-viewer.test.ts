import { describe, expect, test } from "bun:test";

import {
  RECEIPT_VIEWER_PATH,
  RECEIPT_VIEWER_TEMPLATE_SEARCH_PARAM,
} from "../routes/index";
import {
  installReceiptViewerNavigationBridge,
  isReceiptViewerRouteStateCommittedInPage,
  navigateReceiptViewerInPage,
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
        navigate: async ({ template } = {}) => {
          events.push(`navigate:${template ?? "root"}`);
        },
      });

      await navigateReceiptViewerInPage({ template: "tartines" });
    });

    expect(events).toEqual(["navigate:tartines"]);
  });

  test("requires selected template URL and DOM state to match", async () => {
    const fakeWindow = createFakeReceiptViewerWindow({
      search: `?${RECEIPT_VIEWER_TEMPLATE_SEARCH_PARAM}=tartines`,
      templateAttribute: "tartines",
    });

    await withFakeReceiptViewerWindow(fakeWindow, () => {
      expect(
        isReceiptViewerRouteStateCommittedInPage({ template: "tartines" }),
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

  test("rejects URL-only match when DOM still has a stale template", async () => {
    const staleTemplateWindow = createFakeReceiptViewerWindow({
      search: `?${RECEIPT_VIEWER_TEMPLATE_SEARCH_PARAM}=tartines`,
      templateAttribute: "heirvey",
    });

    await withFakeReceiptViewerWindow(staleTemplateWindow, () => {
      expect(
        isReceiptViewerRouteStateCommittedInPage({ template: "tartines" }),
      ).toBe(false);
    });

    const staleResetWindow = createFakeReceiptViewerWindow({
      search: "",
      templateAttribute: "tartines",
    });

    await withFakeReceiptViewerWindow(staleResetWindow, () => {
      expect(isReceiptViewerRouteStateCommittedInPage()).toBe(false);
    });
  });
});
