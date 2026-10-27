import { describe, expect, test } from "bun:test";

import {
  RECEIPT_VIEWER_PATH,
  RECEIPT_VIEWER_TEMPLATE_SEARCH_PARAM,
} from "#isomorphic/routes";

import {
  loadReceiptImagesInPage,
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

  test("waits for each image on and inside the ticket", async () => {
    const loaded: string[] = [];
    const styles = new Map([
      [
        "ticket",
        { backgroundImage: "none", maskImage: 'url("http://x/mask.png")' },
      ],
      ["photo", { backgroundImage: "url(http://x/bg.png)", maskImage: "none" }],
      [
        "logo",
        { backgroundImage: "none", maskImage: 'url("http://x/mask.png")' },
      ],
    ]);
    const listeners = new Map<string, () => void>();
    const pendingLogo = {
      tagName: "IMG",
      complete: false,
      getAttribute: () => "pending-logo",
      addEventListener: (type: string, listener: () => void) => {
        listeners.set(type, listener);
      },
    };
    const loadedLogo = {
      tagName: "IMG",
      complete: true,
      getAttribute: () => "loaded-logo",
      addEventListener: () => {
        throw new Error("A loaded image needs no listener.");
      },
    };
    let selected = "";
    const fakeWindow = {
      ...createFakeReceiptViewerWindow(),
      document: {
        querySelector: () => null,
        querySelectorAll: (selector: string) => {
          selected = selector;
          return [
            ...[...styles.keys()].map((id) => ({ getAttribute: () => id })),
            pendingLogo,
            loadedLogo,
          ];
        },
      },
      getComputedStyle: (element: { getAttribute: () => string }) =>
        styles.get(element.getAttribute()) ?? {
          backgroundImage: "none",
          maskImage: "none",
        },
      Image: class {
        onerror: (() => void) | null = null;
        onload: (() => void) | null = null;
        set src(url: string) {
          loaded.push(url);
          queueMicrotask(() => this.onload?.());
        }
      },
    };

    let settled = false;
    const failed = await withFakeReceiptViewerWindow(fakeWindow, async () => {
      const waiting = loadReceiptImagesInPage("#receipt").then((result) => {
        settled = true;
        return result;
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(settled).toBe(false);

      listeners.get("load")?.();
      return await waiting;
    });

    expect(settled).toBe(true);
    expect(failed).toEqual([]);
    expect(selected).toBe("#receipt, #receipt *");
    expect(loaded.sort()).toEqual(["http://x/bg.png", "http://x/mask.png"]);
  });

  test("an image that won't load is named, not thrown: the ticket still prints", async () => {
    const listeners = new Map<string, () => void>();
    const fakeWindow = {
      ...createFakeReceiptViewerWindow(),
      document: {
        querySelector: () => null,
        querySelectorAll: () => [
          { getAttribute: () => "ticket" },
          {
            tagName: "IMG",
            complete: false,
            getAttribute: () => "http://x/logo.png",
            addEventListener: (type: string, listener: () => void) => {
              listeners.set(type, listener);
            },
          },
        ],
      },
      getComputedStyle: (element: { getAttribute: () => string }) =>
        element.getAttribute() === "ticket"
          ? { backgroundImage: "none", maskImage: 'url("http://x/gone.png")' }
          : { backgroundImage: "none", maskImage: "none" },
      Image: class {
        onerror: (() => void) | null = null;
        onload: (() => void) | null = null;
        set src(_url: string) {
          queueMicrotask(() => this.onerror?.());
        }
      },
    };

    const failed = await withFakeReceiptViewerWindow(fakeWindow, async () => {
      const waiting = loadReceiptImagesInPage("#receipt");
      await new Promise((resolve) => setTimeout(resolve, 0));
      listeners.get("error")?.();
      return await waiting;
    });

    expect(failed.toSorted()).toEqual([
      "http://x/gone.png",
      "http://x/logo.png",
    ]);
  });
});
