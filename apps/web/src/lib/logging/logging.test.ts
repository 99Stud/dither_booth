import { afterEach, describe, expect, it, mock } from "bun:test";
import { toast } from "sonner";

import {
  getKioskErrorDiagnostics,
  initializeBrowserLogging,
  logKioskEvent,
  reportKioskError,
} from "./logging.utils";

const originalConsoleError = console.error;
const originalConsoleInfo = console.info;
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "window",
);
const originalToastError = toast.error;

type TestWindow = Window & {
  __listeners: Map<string, EventListenerOrEventListenerObject>;
};

const restoreWindow = () => {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    return;
  }

  delete (globalThis as { window?: unknown }).window;
};

const setTestWindow = (windowStub: Window | undefined) => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: windowStub,
  });
};

const createTestWindow = (initialStorage: Record<string, string> = {}) => {
  const storageEntries = new Map(Object.entries(initialStorage));
  const listeners = new Map<string, EventListenerOrEventListenerObject>();

  const windowStub = {
    addEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      listeners.set(type, listener);
    },
    localStorage: {
      clear: () => {
        storageEntries.clear();
      },
      getItem: (key: string) => {
        return storageEntries.get(key) ?? null;
      },
      key: (index: number) => {
        return [...storageEntries.keys()][index] ?? null;
      },
      get length() {
        return storageEntries.size;
      },
      removeItem: (key: string) => {
        storageEntries.delete(key);
      },
      setItem: (key: string, value: string) => {
        storageEntries.set(key, value);
      },
    },
    __listeners: listeners,
  } as TestWindow;

  return {
    storageEntries,
    windowStub,
  };
};

const callListener = <TEvent extends Event>(
  listener: EventListenerOrEventListenerObject,
  event: TEvent,
) => {
  if (typeof listener === "function") {
    listener(event);
    return;
  }

  listener.handleEvent(event);
};

afterEach(() => {
  console.error = originalConsoleError;
  console.info = originalConsoleInfo;
  toast.error = originalToastError;
  restoreWindow();
});

describe("getKioskErrorDiagnostics", () => {
  it("preserves structured error fields when given an Error", () => {
    const cause = new Error("Camera permission denied");
    const error = new Error("Camera access failed", { cause });

    error.name = "CameraError";

    expect(getKioskErrorDiagnostics(error, "Camera failed.")).toMatchObject({
      cause: "Camera permission denied",
      message: "Camera access failed",
      name: "CameraError",
      stack: expect.any(String),
    });
  });

  it("falls back to a safe message for non-Error inputs", () => {
    expect(
      getKioskErrorDiagnostics({ reason: "unknown" }, "Camera failed."),
    ).toEqual({
      message: "Camera failed.",
    });
  });
});

describe("logKioskEvent", () => {
  it("keeps reserved fields at the top level and nests caller payload", () => {
    const infoSpy = mock<(...args: [string, unknown]) => void>(
      (..._args) => undefined,
    );

    console.info = infoSpy as typeof console.info;
    setTestWindow(undefined);

    logKioskEvent("info", "camera", "camera-state-changed", {
      details: {
        event: "nested-event",
        level: "nested-level",
        source: "nested-source",
        status: "ready",
      },
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);

    const [prefix, payload] = infoSpy.mock.calls[0]!;

    expect(prefix).toBe("[kiosk]");
    expect(payload).toMatchObject({
      event: "camera-state-changed",
      level: "info",
      loggedAt: expect.any(String),
      source: "camera",
    });
    expect(payload).not.toHaveProperty("deviceId");
    expect(payload).not.toHaveProperty("runId");
    expect(payload).not.toHaveProperty("status");
    expect(payload).toMatchObject({
      details: {
        event: "nested-event",
        level: "nested-level",
        source: "nested-source",
        status: "ready",
      },
    });
  });

  it("adds the persisted deviceId and runId after browser initialization", () => {
    const infoSpy = mock<(...args: [string, unknown]) => void>(
      (..._args) => undefined,
    );
    const firstWindow = createTestWindow({
      "kiosk-device-id": "kiosk-a",
      "kiosk-run-id": "7",
    });

    console.info = infoSpy as typeof console.info;
    setTestWindow(firstWindow.windowStub);

    expect(initializeBrowserLogging()).toEqual({
      deviceId: "kiosk-a",
      runId: 8,
    });
    expect(initializeBrowserLogging()).toEqual({
      deviceId: "kiosk-a",
      runId: 8,
    });

    logKioskEvent("info", "camera", "camera-ready");

    const [firstPrefix, firstPayload] = infoSpy.mock.calls[0]!;

    expect(firstPrefix).toBe("[kiosk]");
    expect(firstPayload).toMatchObject({
      deviceId: "kiosk-a",
      event: "camera-ready",
      runId: 8,
      source: "camera",
    });

    const secondWindow = createTestWindow(
      Object.fromEntries(firstWindow.storageEntries),
    );

    setTestWindow(secondWindow.windowStub);

    expect(initializeBrowserLogging()).toEqual({
      deviceId: "kiosk-a",
      runId: 9,
    });
  });
});

describe("initializeBrowserLogging", () => {
  it("logs uncaught browser errors through the global error handler", () => {
    const errorSpy = mock<(...args: [string, unknown]) => void>(
      (..._args) => undefined,
    );
    const { windowStub } = createTestWindow({
      "kiosk-device-id": "kiosk-b",
      "kiosk-run-id": "2",
    });

    console.error = errorSpy as typeof console.error;
    setTestWindow(windowStub);

    initializeBrowserLogging();

    const windowErrorListener = windowStub.__listeners.get("error");

    expect(windowErrorListener).toBeDefined();

    callListener(windowErrorListener!, {
      colno: 4,
      error: new Error("Camera exploded"),
      filename: "/src/frontend.tsx",
      lineno: 12,
      message: "Camera exploded",
    } as ErrorEvent);

    const [prefix, payload] = errorSpy.mock.calls[0]!;

    expect(prefix).toBe("[kiosk]");
    expect(payload).toMatchObject({
      details: {
        colno: 4,
        filename: "/src/frontend.tsx",
        lineno: 12,
      },
      deviceId: "kiosk-b",
      error: {
        message: "Camera exploded",
        name: "Error",
        stack: expect.any(String),
      },
      event: "window-error",
      level: "error",
      runId: 3,
      source: "web.browser",
    });
  });

  it("logs unhandled promise rejections through the global rejection handler", () => {
    const errorSpy = mock<(...args: [string, unknown]) => void>(
      (..._args) => undefined,
    );
    const { windowStub } = createTestWindow({
      "kiosk-device-id": "kiosk-c",
      "kiosk-run-id": "4",
    });

    console.error = errorSpy as typeof console.error;
    setTestWindow(windowStub);

    initializeBrowserLogging();

    const rejectionListener = windowStub.__listeners.get("unhandledrejection");

    expect(rejectionListener).toBeDefined();

    callListener(rejectionListener!, {
      reason: {
        status: 500,
      },
    } as PromiseRejectionEvent);

    const [prefix, payload] = errorSpy.mock.calls[0]!;

    expect(prefix).toBe("[kiosk]");
    expect(payload).toMatchObject({
      details: {
        reasonType: "object",
      },
      deviceId: "kiosk-c",
      error: {
        message: "Promise rejection was not handled.",
      },
      event: "unhandled-promise-rejection",
      level: "error",
      runId: 5,
      source: "web.browser",
    });
  });
});

describe("reportKioskError", () => {
  it("shows a safe user message while logging richer diagnostics", () => {
    const errorSpy = mock<(...args: [string, unknown]) => void>(
      (..._args) => undefined,
    );
    const toastSpy = mock<
      (
        ...args: Parameters<typeof toast.error>
      ) => ReturnType<typeof toast.error>
    >((..._args) => "toast-id" as ReturnType<typeof toast.error>);

    console.error = errorSpy as typeof console.error;
    toast.error = toastSpy as unknown as typeof toast.error;

    reportKioskError(new Error("SQLITE_BUSY: database is locked"), {
      details: {
        action: "generate-receipt",
      },
      event: "generate-receipt-failed",
      source: "root",
      userMessage: "Generate receipt failed.",
    });

    expect(toastSpy).toHaveBeenCalledWith("Generate receipt failed.");
    expect(errorSpy).toHaveBeenCalledTimes(1);

    const [prefix, payload] = errorSpy.mock.calls[0]!;

    expect(prefix).toBe("[kiosk]");
    expect(payload).toMatchObject({
      details: {
        action: "generate-receipt",
      },
      error: {
        message: "SQLITE_BUSY: database is locked",
        name: "Error",
        stack: expect.any(String),
      },
      event: "generate-receipt-failed",
      level: "error",
      source: "root",
    });
  });
});
