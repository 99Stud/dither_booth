import { describe, expect, test } from "bun:test";

import {
  navigateReceiptViewerClientSide,
  runExclusiveReceiptViewerPageJob,
  withReceiptViewerTemplate,
} from "./receipt-viewer-page.utils";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};

  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

type NavigationPage = Parameters<
  typeof navigateReceiptViewerClientSide
>[0]["page"];

function createNavigationPage(
  events: string[],
  {
    failWaitForTemplate,
  }: {
    failWaitForTemplate?: string;
  } = {},
) {
  const page = {
    async evaluate(_fn: unknown, options?: { template?: string }) {
      events.push(`evaluate:${options?.template ?? "root"}`);
    },
    async goto() {
      events.push("goto");
    },
    async waitForFunction(
      _fn: unknown,
      _options: unknown,
      pageOptions?: { template?: string },
    ) {
      events.push(`wait:${pageOptions?.template ?? "root"}`);

      if (
        failWaitForTemplate !== undefined &&
        pageOptions?.template === failWaitForTemplate
      ) {
        throw new Error(`wait failed for ${pageOptions.template}`);
      }
    },
  };

  return page as unknown as NavigationPage & { goto: () => Promise<void> };
}

describe("navigateReceiptViewerClientSide", () => {
  test("selects a template without page.goto", async () => {
    const events: string[] = [];
    const page = createNavigationPage(events);

    await navigateReceiptViewerClientSide({
      page,
      template: "tartines",
    });

    expect(events).toEqual(["evaluate:tartines", "wait:tartines"]);
    expect(events).not.toContain("goto");
  });
});

describe("withReceiptViewerTemplate", () => {
  test("resets to the root receipt viewer route after success", async () => {
    const events: string[] = [];
    const page = createNavigationPage(events);

    const value = await withReceiptViewerTemplate({
      page,
      run: async () => {
        events.push("screenshot");
        return "ok";
      },
      template: "tartines",
    });

    expect(value).toBe("ok");
    expect(events).toEqual([
      "evaluate:tartines",
      "wait:tartines",
      "screenshot",
      "evaluate:root",
      "wait:root",
    ]);
  });

  test("resets to the root receipt viewer route after failure", async () => {
    const events: string[] = [];
    const page = createNavigationPage(events);
    const screenshotError = new Error("screenshot failed");
    let thrown: unknown;

    try {
      await withReceiptViewerTemplate({
        page,
        run: async () => {
          events.push("screenshot");
          throw screenshotError;
        },
        template: "tartines",
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(screenshotError);
    expect(events).toEqual([
      "evaluate:tartines",
      "wait:tartines",
      "screenshot",
      "evaluate:root",
      "wait:root",
    ]);
  });

  test("resets to the root receipt viewer route after template selection failure", async () => {
    const events: string[] = [];
    const page = createNavigationPage(events, {
      failWaitForTemplate: "tartines",
    });
    let didRun = false;
    let thrown: unknown;

    try {
      await withReceiptViewerTemplate({
        page,
        run: async () => {
          didRun = true;
          events.push("screenshot");
          return "ok";
        },
        template: "tartines",
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeDefined();
    expect(didRun).toBe(false);
    expect(events).toEqual([
      "evaluate:tartines",
      "wait:tartines",
      "evaluate:root",
      "wait:root",
    ]);
  });
});

describe("runExclusiveReceiptViewerPageJob", () => {
  test("serializes jobs that use the shared page", async () => {
    const events: string[] = [];
    const firstRelease = createDeferred<void>();

    const firstJob = runExclusiveReceiptViewerPageJob(async () => {
      events.push("first:start");
      await firstRelease.promise;
      events.push("first:end");
    });

    await flushMicrotasks();

    const secondJob = runExclusiveReceiptViewerPageJob(async () => {
      events.push("second:start");
    });

    await flushMicrotasks();
    expect(events).toEqual(["first:start"]);

    firstRelease.resolve();
    await Promise.all([firstJob, secondJob]);

    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });
});
